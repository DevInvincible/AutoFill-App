import asyncio
from concurrent.futures import ThreadPoolExecutor
import os
import uuid
from playwright.sync_api import sync_playwright
try:
    from playwright_stealth import stealth_sync
except ImportError:
    stealth_sync = None  # Graceful fallback if not installed yet
from app.services.form_mapper import map_form_fields
from app.services.form_filler import (
    prepare_fill_actions,
    fill_form,
)
from app.services.profile_service import get_test_profile
from app.schemas.profile import UserProfile
from app.services.form_agent import analyze_form_questions
from app.db import save_session, get_session, delete_session

executor = ThreadPoolExecutor(max_workers=3)

# Concurrency Management
# We create a dedicated ThreadPoolExecutor (1 thread) per user session.
# This ensures that Playwright sync API is always called from the same thread 
# that created the browser, preventing "Event loop is closed" crashes.
_session_executors = {}

_active_playwrights = {}
_active_contexts = {}
_active_pages = {}
_active_login_pages = {}

def get_executor(thread_id: str) -> ThreadPoolExecutor:
    if thread_id not in _session_executors:
        _session_executors[thread_id] = ThreadPoolExecutor(max_workers=1)
    return _session_executors[thread_id]

def get_browser_page(thread_id: str):
    if thread_id not in _active_playwrights:
        _active_playwrights[thread_id] = sync_playwright().start()

    # Force headless mode in cloud to prevent XServer crashes
    is_headless = True

    if thread_id not in _active_contexts:
        _active_contexts[thread_id] = _active_playwrights[thread_id].chromium.launch_persistent_context(
            user_data_dir=f"./browser_data_{thread_id}",
            headless=is_headless,
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
        )

    try:
        page = _active_pages.get(thread_id)
        if page is None or page.is_closed():
            _active_pages[thread_id] = _active_contexts[thread_id].new_page()
            if stealth_sync:
                stealth_sync(_active_pages[thread_id])
    except Exception as e:
        print(f"Browser context closed for {thread_id}, restarting... ({e})")
        try:
            _active_contexts[thread_id].close()
        except:
            pass

        _active_contexts[thread_id] = _active_playwrights[thread_id].chromium.launch_persistent_context(
            user_data_dir=f"./browser_data_{thread_id}",
            headless=is_headless,
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
        )
        _active_pages[thread_id] = _active_contexts[thread_id].new_page()
        if stealth_sync:
            stealth_sync(_active_pages[thread_id])

    return _active_pages[thread_id]

def inspect_page_sync(url: str, cookies: list[dict] = None):
    # Force headless mode in cloud to prevent XServer crashes
    is_headless = True
    with sync_playwright() as p:

        context = p.chromium.launch_persistent_context(
            user_data_dir="./browser_data",
            headless=is_headless,
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
        )
        
        if cookies:
            try:
                context.add_cookies(cookies)
            except Exception as e:
                print(f"Failed to add cookies in inspect: {e}")

        print("PLAYWRIGHT BROWSER STARTED")

        page = context.new_page()

        page.goto(
            url,
            wait_until="domcontentloaded",
            timeout=30000,
        )

        result = {
            "url": page.url,
            "title": page.title(),

            "text": page.locator("body").inner_text(),

            "links": page.locator("a").evaluate_all("""
                elements => elements.map(el => ({
                    text: el.innerText,
                    href: el.href,
                    ariaLabel: el.getAttribute("aria-label")
                }))
            """),

            "buttons": page.locator("button").evaluate_all("""
                elements => elements.map(el => ({
                    text: el.innerText,
                    type: el.type,
                    ariaLabel: el.getAttribute("aria-label")
                }))
            """),

            "inputs": page.locator("input").evaluate_all("""
                elements => elements.map(el => ({
                    type: el.type,
                    name: el.name,
                    placeholder: el.placeholder
                }))
            """),

            "textareas": page.locator("textarea").evaluate_all("""
                elements => elements.map(el => ({
                    name: el.name,
                    placeholder: el.placeholder
                }))
            """),
        }

        context.close()

        return result
def extract_job_context(page):
    """
    Extract basic job information from the job page
    before opening the application form.
    """

    title = page.title()

    # Get visible page text.
    body_text = page.locator("body").inner_text()

    # Try common job-page selectors.
    job_title = ""

    selectors = [
        "h1",
        "[data-qa='job-title']",
        "[data-testid='job-title']",
        ".job-title",
    ]

    for selector in selectors:
        try:
            locator = page.locator(selector).first

            if locator.count() > 0 and locator.is_visible():
                text = locator.inner_text().strip()

                if text:
                    job_title = text
                    break

        except Exception:
            continue

    # Fallback to page title.
    if not job_title:
        job_title = title

    return {
        "url": page.url,
        "page_title": title,
        "job_title": job_title,
        "page_text": body_text,
    }

def click_apply_sync(
    thread_id: str,
    url: str,
    profile: UserProfile,
    cookies: list[dict] = None,
):
    page = get_browser_page(thread_id)
    
    if cookies:
        try:
            # Log cookie details to help debug session transfer issues
            print(f"[COOKIES] Received {len(cookies)} cookies from app.")
            for c in cookies[:5]:  # Print first 5 only
                print(f"  - {c.get('name')} | domain={c.get('domain')} | path={c.get('path')} | value_len={len(str(c.get('value','')))}")
            page.context.add_cookies(cookies)
            print(f"[COOKIES] Injected successfully into browser context.")
        except Exception as e:
            print(f"[COOKIES] Failed to inject cookies: {e}")

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
    except Exception as e:
        if "TargetClosedError" in str(e) or "closed" in str(e).lower():
            return {"success": False, "message": "Browser was closed before the page could load."}
        print(f"[GOTO] Warning during page.goto: {e}")

    current_url = page.url
    print(f"[GOTO] Final URL after navigation: {current_url}")
    current_url_lower = current_url.lower()
    login_keywords = ["/login", "/signup", "authwall", "signin"]

    if any(keyword in current_url_lower for keyword in login_keywords):
        print(f"[AUTH] Login wall detected at: {current_url}")
        current_login_url = page.url
        page.close()
        return {
            "success": False,
            "requires_login": True,
            "message": "Please login to the job platform (LinkedIn/Indeed) first.",
            "login_url": current_login_url
        }

    # Extract job information BEFORE opening the application form.
    job_context = extract_job_context(page)
    
    # ------------------------------------------------------------------
    # Find Apply button — multi-strategy for different portals
    # Indeed uses "Apply now", LinkedIn uses "Easy Apply", others vary.
    # ------------------------------------------------------------------
    def find_apply_button():
        # Strategy 1: role=button with Apply variants
        for label in ["Apply now", "Apply Now", "Apply", "Easy Apply", "Apply on company website"]:
            try:
                btn = page.get_by_role("button", name=label, exact=False).first
                if btn.count() > 0 and btn.is_visible():
                    print(f"[APPLY] Found via button role: '{label}'")
                    return btn
            except:
                pass

        # Strategy 2: role=link with Apply variants
        for label in ["Apply now", "Apply Now", "Apply", "Apply on company website"]:
            try:
                lnk = page.get_by_role("link", name=label, exact=False).first
                if lnk.count() > 0 and lnk.is_visible():
                    print(f"[APPLY] Found via link role: '{label}'")
                    return lnk
            except:
                pass

        # Strategy 3: Indeed/LinkedIn-specific data attributes
        for sel in [
            "[data-testid='indeedApply']",
            "[data-testid='apply-button']",
            "[class*='indeed-apply' i]",
            "[class*='apply-button' i]",
            "[id*='apply' i]",
            "[aria-label*='apply' i]",
        ]:
            try:
                el = page.locator(sel).first
                if el.count() > 0 and el.is_visible():
                    print(f"[APPLY] Found via selector: {sel}")
                    return el
            except:
                pass

        # Strategy 4: JS deep text search as last resort
        try:
            el = page.evaluate_handle("""
                () => {
                    const tags = [...document.querySelectorAll('button, a')];
                    return tags.find(el => /apply/i.test(el.innerText || el.textContent));
                }
            """)
            if el:
                loc = page.locator(":scope").filter(has=page.locator("button, a")).first
                print("[APPLY] Found via JS text search")
        except:
            pass

        return None

    # Scroll to trigger lazy-loaded content, then search
    page.evaluate("window.scrollTo(0, 400)")
    page.wait_for_timeout(1500)

    apply_button = find_apply_button()

    if not apply_button:
        # Log all visible buttons to help future debugging
        try:
            all_btns = page.locator("button, a").all()
            visible_texts = [b.inner_text() for b in all_btns if b.is_visible()][:10]
            print(f"[APPLY] No apply button found. Visible buttons/links: {visible_texts}")
        except:
            pass
        return {
            "success": False,
            "message": "Apply button not found. The job may have expired, already been filled, or uses an unsupported portal layout.",
        }

    print("Apply button found!")

    try:
        apply_button.click(force=True, timeout=5000)
    except Exception as e:
        print(f"Failed to click apply button normally, trying JS click... {e}")
        apply_button.evaluate("node => node.click()")

    page.wait_for_timeout(2000)

    print("Application form opened!")

    # 1. Extract complete form
    form_data = extract_form(page)

    # 2. Map complete form
    mapped_form = map_form_fields(form_data)

    # 3. Prepare known profile fields
    fill_actions = prepare_fill_actions(
        mapped_form,
        profile,
    )

    agent_result = analyze_form_questions(
        mapped_form=mapped_form,
        profile=profile,
        job_context=job_context,
        thread_id=thread_id
    )

    # Store session for /jobs/fill
    save_session(thread_id, {
        "fill_actions": fill_actions,
        "mapped_form": mapped_form,
        "profile": profile.model_dump(),
        "job_context": job_context,
    })

    return {
        "success": True,
        "url": page.url,
        "title": page.title(),
        "job_context": job_context,
        "form": mapped_form,
        "fill_actions": fill_actions,
        "agent_response": agent_result.get("agent_response"),
        "__interrupt__": agent_result.get("__interrupt__"),
        "thread_id": thread_id,
    }

def extract_form(page):

    # ---------------------------------------------------------
    # Helper: extract label
    # ---------------------------------------------------------

    def get_label_js():
        return """
        el => {
            let labelText = '';

            if (el.id) {
                const label = document.querySelector(
                    `label[for="${CSS.escape(el.id)}"]`
                );

                if (label) {
                    labelText = label.innerText.trim();
                }
            }

            if (!labelText) {
                const parentLabel = el.closest('label');

                if (parentLabel) {
                    labelText = parentLabel.innerText.trim();
                }
            }

            if (!labelText) {
                const labelledBy = el.getAttribute(
                    'aria-labelledby'
                );

                if (labelledBy) {
                    labelText = labelledBy
                        .split(' ')
                        .map(id => document.getElementById(id))
                        .filter(Boolean)
                        .map(node => node.innerText.trim())
                        .join(' ');
                }
            }

            return labelText;
        }
        """

    # ---------------------------------------------------------
    # INPUTS
    # ---------------------------------------------------------

    inputs = page.locator(
        "input:not([type='checkbox']):not([type='radio'])"
    ).evaluate_all("""
        elements => elements.map(el => {

            let labelText = '';

            if (el.id) {
                const label = document.querySelector(
                    `label[for="${CSS.escape(el.id)}"]`
                );

                if (label) {
                    labelText = label.innerText.trim();
                }
            }

            if (!labelText) {
                const parentLabel = el.closest('label');

                if (parentLabel) {
                    labelText = parentLabel.innerText.trim();
                }
            }

            if (!labelText) {
                const labelledBy =
                    el.getAttribute('aria-labelledby');

                if (labelledBy) {
                    labelText = labelledBy
                        .split(' ')
                        .map(id => document.getElementById(id))
                        .filter(Boolean)
                        .map(node => node.innerText.trim())
                        .join(' ');
                }
            }

            // If still no label, traverse up to 5 parent elements to find a heading
            if (!labelText) {
                let parent = el.parentElement;
                for (let i = 0; i < 5 && parent; i++) {
                    const candidates = parent.querySelectorAll(
                        'h1, h2, h3, h4, h5, h6, ' +
                        '[role="heading"], ' +
                        '.question, ' +
                        '.question-label, ' +
                        '.field-label'
                    );
                    for (const candidate of candidates) {
                        const text = candidate.innerText.trim();
                        if (text && text.length < 300) {
                            labelText = text;
                            break;
                        }
                    }
                    if (labelText) {
                        break;
                    }
                    parent = parent.parentElement;
                }
            }

            const role = el.getAttribute('role');

            const isCustomDropdown =
                role === 'combobox' ||
                el.getAttribute('aria-haspopup') === 'listbox' ||
                el.getAttribute('aria-controls') !== null;

            return {
                type: el.type,
                name: el.name,
                id: el.id,
                placeholder: el.placeholder,
                required: el.required,
                value: el.value,
                label: labelText,

                role: role,

                is_custom_dropdown: isCustomDropdown,

                aria_expanded:
                    el.getAttribute('aria-expanded'),

                aria_haspopup:
                    el.getAttribute('aria-haspopup'),

                aria_controls:
                    el.getAttribute('aria-controls'),

                aria_label:
                    el.getAttribute('aria-label'),

                aria_labelledby:
                    el.getAttribute('aria-labelledby'),

                readonly: el.readOnly
            };
        })
    """)

    # ---------------------------------------------------------
    # CHECKBOXES
    # ---------------------------------------------------------

    checkboxes = page.locator(
        'input[type="checkbox"]'
    ).evaluate_all("""
        elements => elements.map(el => {

            let labelText = '';

            if (el.id) {
                const label = document.querySelector(
                    `label[for="${CSS.escape(el.id)}"]`
                );

                if (label) {
                    labelText = label.innerText.trim();
                }
            }

            if (!labelText) {
                const parentLabel = el.closest('label');

                if (parentLabel) {
                    labelText = parentLabel.innerText.trim();
                }
            }

            let groupLabel = '';

            const fieldset = el.closest('fieldset');

            if (fieldset) {
                const legend = fieldset.querySelector('legend');

                if (legend) {
                    groupLabel = legend.innerText.trim();
                }
            }

            if (!groupLabel) {
                const labelledBy =
                    el.getAttribute('aria-labelledby');

                if (labelledBy) {
                    groupLabel = labelledBy
                        .split(' ')
                        .map(id => document.getElementById(id))
                        .filter(Boolean)
                        .map(node => node.innerText.trim())
                        .join(' ');
                }
            }

            if (!groupLabel) {
                const describedBy =
                    el.getAttribute('aria-describedby');

                if (describedBy) {
                    groupLabel = describedBy
                        .split(' ')
                        .map(id => document.getElementById(id))
                        .filter(Boolean)
                        .map(node => node.innerText.trim())
                        .join(' ');
                }
            }

            if (!groupLabel) {

                let parent = el.parentElement;

                for (let i = 0; i < 5 && parent; i++) {

                    const legend = parent.querySelector('legend');

                    if (legend) {
                        groupLabel = legend.innerText.trim();
                        break;
                    }

                    const candidates =
                        parent.querySelectorAll(
                            'h1, h2, h3, h4, h5, h6, ' +
                            '[role="heading"], ' +
                            '.question, ' +
                            '.question-label, ' +
                            '.field-label'
                        );

                    for (const candidate of candidates) {

                        const text =
                            candidate.innerText.trim();

                        if (
                            text &&
                            text !== labelText &&
                            text.length < 300
                        ) {
                            groupLabel = text;
                            break;
                        }
                    }

                    if (groupLabel) {
                        break;
                    }

                    parent = parent.parentElement;
                }
            }

            return {
                name: el.name,
                id: el.id,
                value: el.value,
                required: el.required,
                checked: el.checked,

                label: labelText,
                group_label: groupLabel
            };
        })
    """)

    # ---------------------------------------------------------
    # RADIOS
    # ---------------------------------------------------------

    radios = page.locator(
        'input[type="radio"]'
    ).evaluate_all("""
        elements => elements.map(el => {

            let labelText = '';

            if (el.id) {
                const label = document.querySelector(
                    `label[for="${CSS.escape(el.id)}"]`
                );

                if (label) {
                    labelText = label.innerText.trim();
                }
            }

            if (!labelText) {
                const parentLabel = el.closest('label');

                if (parentLabel) {
                    labelText = parentLabel.innerText.trim();
                }
            }

            return {
                name: el.name,
                id: el.id,
                value: el.value,
                required: el.required,
                checked: el.checked,
                label: labelText
            };
        })
    """)

    # ---------------------------------------------------------
    # TEXTAREAS
    # ---------------------------------------------------------

    textareas = page.locator(
        "textarea"
    ).evaluate_all("""
        elements => elements.map(el => {

            let labelText = '';

            if (el.id) {
                const label = document.querySelector(
                    `label[for="${CSS.escape(el.id)}"]`
                );

                if (label) {
                    labelText = label.innerText.trim();
                }
            }

            if (!labelText) {
                const parentLabel = el.closest('label');

                if (parentLabel) {
                    labelText = parentLabel.innerText.trim();
                }
            }

            if (!labelText) {
                const labelledBy =
                    el.getAttribute('aria-labelledby');

                if (labelledBy) {
                    labelText = labelledBy
                        .split(' ')
                        .map(id => document.getElementById(id))
                        .filter(Boolean)
                        .map(node => node.innerText.trim())
                        .join(' ');
                }
            }

            return {
                name: el.name,
                id: el.id,
                placeholder: el.placeholder,
                required: el.required,
                value: el.value,
                label: labelText
            };
        })
    """)

    # ---------------------------------------------------------
    # NORMAL SELECTS
    # ---------------------------------------------------------

    selects = page.locator(
        "select"
    ).evaluate_all("""
        elements => elements.map(el => {

            let labelText = '';

            if (el.id) {
                const label = document.querySelector(
                    `label[for="${CSS.escape(el.id)}"]`
                );

                if (label) {
                    labelText = label.innerText.trim();
                }
            }

            if (!labelText) {
                const parentLabel = el.closest('label');

                if (parentLabel) {
                    labelText = parentLabel.innerText.trim();
                }
            }

            return {
                name: el.name,
                id: el.id,
                required: el.required,
                value: el.value,
                label: labelText,

                options: Array.from(el.options).map(option => ({
                    text: option.text.trim(),
                    value: option.value
                }))
            };
        })
    """)

    # ---------------------------------------------------------
    # ARIA CONTROLS
    # ---------------------------------------------------------

    # Fix #15: Renamed from 'aria_controls' to 'aria_elements'
    # to avoid shadowing by the per-combobox variable in the
    # custom dropdown loop below.
    aria_elements = page.locator(
        '[role="combobox"], [role="checkbox"], [role="radio"]'
    ).evaluate_all("""
        elements => elements.map(el => {

            let labelText = '';

            const labelledBy =
                el.getAttribute('aria-labelledby');

            if (labelledBy) {
                labelText = labelledBy
                    .split(' ')
                    .map(id => document.getElementById(id))
                    .filter(Boolean)
                    .map(node => node.innerText.trim())
                    .join(' ');
            }

            if (!labelText && el.getAttribute('aria-label')) {
                labelText =
                    el.getAttribute('aria-label');
            }

            if (!labelText) {
                labelText = el.innerText.trim();
            }

            return {
                role: el.getAttribute('role'),
                id: el.id,
                name: el.getAttribute('name'),

                label: labelText,

                aria_label:
                    el.getAttribute('aria-label'),

                aria_labelledby:
                    labelledBy,

                aria_expanded:
                    el.getAttribute('aria-expanded'),

                aria_checked:
                    el.getAttribute('aria-checked'),

                aria_haspopup:
                    el.getAttribute('aria-haspopup'),

                aria_controls:
                    el.getAttribute('aria-controls'),

                text: el.innerText.trim(),

                value:
                    el.getAttribute('value')
            };
        })
    """)

    # ---------------------------------------------------------
    # CUSTOM DROPDOWNS
    # ---------------------------------------------------------

    custom_dropdowns = []

    comboboxes = page.locator(
        '[role="combobox"], '
        'input[aria-haspopup="listbox"], '
        'input[aria-controls]'
    )

    count = comboboxes.count()

    for i in range(count):

        combo = comboboxes.nth(i)

        try:

            if not combo.is_visible():
                continue

            combo_id = combo.get_attribute("id")
            combo_name = combo.get_attribute("name")
            combo_aria_controls = combo.get_attribute(
                "aria-controls"
            )

            # -------------------------------------------------
            # Label
            # -------------------------------------------------

            label = combo.evaluate("""
                el => {

                    let labelText = '';

                    if (el.id) {

                        const label =
                            document.querySelector(
                                `label[for="${CSS.escape(el.id)}"]`
                            );

                        if (label) {
                            labelText =
                                label.innerText.trim();
                        }
                    }

                    if (!labelText) {

                        const labelledBy =
                            el.getAttribute(
                                'aria-labelledby'
                            );

                        if (labelledBy) {

                            labelText =
                                labelledBy
                                    .split(' ')
                                    .map(id =>
                                        document.getElementById(id)
                                    )
                                    .filter(Boolean)
                                    .map(node =>
                                        node.innerText.trim()
                                    )
                                    .join(' ');
                        }
                    }

                    if (!labelText) {

                        labelText =
                            el.getAttribute('aria-label') || '';
                    }

                    return labelText;
                }
            """)

            # -------------------------------------------------
            # Open dropdown
            # -------------------------------------------------

            combo.click()

            page.wait_for_timeout(500)

            # -------------------------------------------------
            # Find options
            # -------------------------------------------------

            option_locator = None

            if combo_aria_controls:

                controlled = page.locator(
                    f'#{combo_aria_controls}'
                )

                if controlled.count() > 0:

                    option_locator = controlled.locator(
                        '[role="option"]'
                    )

            if option_locator is None:

                visible_listboxes = page.locator(
                    '[role="listbox"]:visible'
                )

                if visible_listboxes.count() > 0:

                    option_locator = (
                        visible_listboxes.last
                        .locator('[role="option"]')
                    )

            options = []

            if option_locator is not None:

                options = option_locator.evaluate_all("""
                    elements => elements
                        .filter(el => {

                            const style =
                                window.getComputedStyle(el);

                            const rect =
                                el.getBoundingClientRect();

                            return (
                                style.display !== 'none' &&
                                style.visibility !== 'hidden' &&
                                rect.width > 0 &&
                                rect.height > 0
                            );
                        })
                        .map(el => ({

                            text:
                                el.innerText.trim(),

                            value:
                                el.getAttribute('data-value') ||
                                el.getAttribute('value') ||
                                el.getAttribute(
                                    'data-option-value'
                                ) ||
                                el.innerText.trim(),

                            id: el.id
                        }))
                        .filter(option => option.text)
                """)

            # -------------------------------------------------
            # Remove duplicates
            # -------------------------------------------------

            unique_options = []
            seen = set()

            for option in options:

                key = (
                    option.get("text", "").strip().lower(),
                    str(
                        option.get("value", "")
                    ).strip().lower()
                )

                if key in seen:
                    continue

                seen.add(key)
                unique_options.append(option)

            # -------------------------------------------------
            # Current value
            # -------------------------------------------------

            try:

                if combo.evaluate(
                    "el => el.tagName === 'INPUT'"
                ):
                    current_value = combo.input_value()

                else:
                    current_value = combo.inner_text()

            except Exception:

                current_value = ""

            # -------------------------------------------------
            # Close dropdown
            # -------------------------------------------------

            page.keyboard.press("Escape")

            custom_dropdowns.append({
                "type": "custom_dropdown",
                "id": combo_id,
                "name": combo_name,
                "label": label,
                "value": current_value,
                "required": False,
                "role": "combobox",
                "is_custom_dropdown": True,
                "aria_controls": combo_aria_controls,
                "options": unique_options
            })

        except Exception as e:

            print(
                f"Could not extract custom dropdown "
                f"{i}: {e}"
            )

            try:
                page.keyboard.press("Escape")
            except Exception:
                pass

    # ---------------------------------------------------------
    # MERGE CUSTOM DROPDOWNS INTO INPUTS
    # ---------------------------------------------------------

    for dropdown in custom_dropdowns:

        inputs.append(dropdown)

    # ---------------------------------------------------------
    # RETURN COMPLETE FORM
    # ---------------------------------------------------------

    return {
        "inputs": inputs,
        "checkboxes": checkboxes,
        "radios": radios,
        "textareas": textareas,
        "selects": selects,
        "aria_controls": aria_elements,
        "custom_dropdowns": custom_dropdowns,
    }
            
async def inspect_page(url: str, cookies: list[dict] = None):
    loop = asyncio.get_running_loop()

    return await loop.run_in_executor(
        executor,
        inspect_page_sync,
        url,
        cookies
    )

async def click_apply(
    url: str,
    profile: UserProfile,
    cookies: list[dict] = None,
):
    loop = asyncio.get_running_loop()
    thread_id = str(uuid.uuid4())

    return await loop.run_in_executor(
        get_executor(thread_id),
        click_apply_sync,
        thread_id,
        url,
        profile,
        cookies,
    )


# ==============================================================
# MANUAL LOGIN
# ==============================================================

def manual_login_sync(url: str):
    thread_id = "login_flow"
    page = get_browser_page(thread_id)
    
    page.goto(url)

    print(f"Opened {url} for manual login. Please log in.")

    try:
        # Poll for 5 minutes (600 * 0.5s)
        for _ in range(600):
            try:
                if page.is_closed():
                    break
                current = page.url.lower()
                # Heuristic: If we are no longer on a login/auth/checkpoint page, assume success
                if "login" not in current and "auth" not in current and "sign-in" not in current and "checkpoint" not in current:
                    page.wait_for_timeout(2000) # wait for cookies to settle
                    break
            except Exception:
                # Page or browser was closed by user
                break
            
            page.wait_for_timeout(500)
            
    finally:
        # Completely close the browser context so the window disappears
        try:
            if _active_contexts.get("login_flow"):
                _active_contexts["login_flow"].close()
        except:
            pass
        _active_contexts.pop("login_flow", None)
        _active_pages.pop("login_flow", None)

    return {"success": True, "message": "Login flow finished."}

def cancel_login_sync():
    try:
        if _active_contexts.get("login_flow"):
            _active_contexts["login_flow"].close()
    except:
        pass
    _active_contexts.pop("login_flow", None)
    _active_pages.pop("login_flow", None)
    return {"success": True}

async def cancel_login():
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(get_executor("login_flow"), cancel_login_sync)

async def manual_login(url: str):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        get_executor("login_flow"),
        manual_login_sync,
        url
    )


# ==============================================================
# CONVERT AGENT ANSWERS → FILL ACTIONS
# ==============================================================

def convert_agent_answers_to_actions(
    agent_answers: list,
    mapped_form: dict,
) -> list:
    """
    Convert merged agent_response.answers into fill actions
    that fill_form() can execute.

    Handles:
    - text / textarea / custom_dropdown → single action
    - checkbox_group → one action per checked option
    """

    actions = []

    # Build lookup: field id/name → original field metadata
    field_lookup = {}

    for field in mapped_form.get("fields", []):

        fid = field.get("id")
        fname = field.get("name")

        if fid:
            field_lookup[fid] = field

        if fname:
            field_lookup[fname] = field

    for answer in agent_answers:

        value = answer.get("answer")

        # Skip if no answer at all (user never provided one)
        if answer.get("needs_user_input") and value is None:
            continue

        if value is None:
            continue

        answer_id = answer.get("id") or answer.get("name") or ""
        field_type = answer.get("field_type", "text")
        question = answer.get("question", "")

        # Look up original field for metadata
        original = field_lookup.get(answer_id, {})

        # ==============================================
        # CHECKBOX GROUP
        # ==============================================

        if field_type == "checkbox_group":

            # value is a list of selected option labels
            selected = value if isinstance(value, list) else [value]

            options = original.get("options", [])

            for option in options:

                opt_label = option.get("label", "")
                opt_id = option.get("id", "")
                opt_name = option.get("name", "")

                # Check if this option was selected
                should_check = any(
                    opt_label.strip().lower() == s.strip().lower()
                    for s in selected
                )

                if should_check:

                    actions.append({
                        "semantic_type": "agent_answer",
                        "field_type": "checkbox",
                        "value": True,
                        "id": opt_id,
                        "name": opt_name,
                        "label": opt_label,
                        "is_custom_dropdown": False,
                    })

            continue

        # ==============================================
        # CUSTOM DROPDOWN
        # ==============================================

        if field_type == "custom_dropdown":

            actions.append({
                "semantic_type": "agent_answer",
                "field_type": original.get("type", "text"),
                "value": value,
                "id": answer_id,
                "name": original.get("name", ""),
                "label": question,
                "is_custom_dropdown": True,
                "aria_expanded": original.get("aria_expanded"),
                "aria_controls": original.get("aria_controls"),
                "aria_haspopup": original.get("aria_haspopup"),
            })

            continue

        # ==============================================
        # SELECT (native)
        # ==============================================

        if field_type == "select":

            actions.append({
                "semantic_type": "agent_answer",
                "field_type": "select",
                "value": value,
                "id": answer_id,
                "name": original.get("name", ""),
                "label": question,
                "is_custom_dropdown": False,
            })

            continue

        # ==============================================
        # TEXT / TEXTAREA / DEFAULT
        # ==============================================

        actions.append({
            "semantic_type": "agent_answer",
            "field_type": field_type,
            "value": value,
            "id": answer_id,
            "name": original.get("name", ""),
            "label": question,
            "is_custom_dropdown": original.get(
                "is_custom_dropdown", False
            ),
            "aria_expanded": original.get("aria_expanded"),
            "aria_controls": original.get("aria_controls"),
            "aria_haspopup": original.get("aria_haspopup"),
        })

    return actions


# ==============================================================
# FILL JOB FORM
# ==============================================================

def fill_job_form_sync(thread_id: str):
    """
    Combine profile fill_actions + merged agent answers
    and fill the still-open browser form.
    """

    # ----------------------------------------------------------
    # Get stored session
    # ----------------------------------------------------------

    session = get_session(thread_id)

    if not session:
        return {
            "success": False,
            "error": "Session not found. Call /jobs/apply first.",
        }

    # ----------------------------------------------------------
    # Get the LangGraph state for merged answers
    # ----------------------------------------------------------

    from app.services.form_agent import form_agent

    state = form_agent.get_state(
        config={
            "configurable": {
                "thread_id": thread_id
            }
        },
    )

    # ----------------------------------------------------------
    # DEBUG: show what LangGraph state contains
    # ----------------------------------------------------------

    print("\n" + "=" * 60)
    print("DEBUG fill_job_form_sync — LangGraph state")
    print("=" * 60)
    print(f"  state.next  : {state.next}")
    print(f"  state keys  : {list(state.values.keys())}")

    agent_response = state.values.get("agent_response", {})
    agent_answers  = agent_response.get("answers", [])
    user_answers   = state.values.get("user_answers", {})

    print(f"  agent_response total_questions : {agent_response.get('total_questions', 'N/A')}")
    print(f"  agent_answers count            : {len(agent_answers)}")
    print(f"  user_answers keys              : {list(user_answers.keys()) if user_answers else '(none)'}")

    for i, ans in enumerate(agent_answers):
        print(
            f"  answer[{i}] id={ans.get('id')!r:20s} "
            f"name={ans.get('name')!r:30s} "
            f"needs_user_input={ans.get('needs_user_input')} "
            f"answer={str(ans.get('answer'))[:40]!r}"
        )
    print("=" * 60)

    mapped_form = session["mapped_form"]
    profile_actions = session["fill_actions"]

    # ----------------------------------------------------------
    # Convert agent answers → fill actions
    # ----------------------------------------------------------

    agent_actions = convert_agent_answers_to_actions(
        agent_answers,
        mapped_form,
    )

    # ----------------------------------------------------------
    # Combine: profile first, then agent answers
    # ----------------------------------------------------------

    all_actions = profile_actions + agent_actions

    print("\n" + "=" * 60)
    print(f"FILLING FORM: {len(profile_actions)} profile + {len(agent_actions)} agent = {len(all_actions)} total")
    print("=" * 60)

    # ----------------------------------------------------------
    # Fill the form on the still-open page
    # ----------------------------------------------------------

    page = get_browser_page(thread_id)

    filled = fill_form(
        page,
        all_actions,
    )

    # ----------------------------------------------------------
    # Take screenshot for user review
    # ----------------------------------------------------------

    screenshot_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "files",
        f"filled_form_{thread_id}.png",
    )

    try:
        page.screenshot(
            path=screenshot_path,
            full_page=True,
        )
        screenshot_taken = True
    except Exception as e:
        print(f"Screenshot failed: {e}")
        screenshot_path = None
        screenshot_taken = False

    import re

    next_buttons = page.get_by_role("button", name=re.compile(r"^(Next|Continue|Review)$", re.IGNORECASE))
    submit_buttons = page.get_by_role("button", name=re.compile(r"^(Submit application|Submit|Send)$", re.IGNORECASE))

    status = "completed"
    interrupt = None

    if next_buttons.count() > 0 and next_buttons.first.is_visible():
        print("Found NEXT button, clicking to proceed to next page...")
        next_buttons.first.click()
        page.wait_for_timeout(3000)

        # Extract new page
        new_form_data = extract_form(page)
        new_mapped_form = map_form_fields(new_form_data)
        
        # Fix #4: Generate a NEW thread_id for each page so
        # LangGraph state from page 1 doesn't bleed into page 2.
        new_thread_id = str(uuid.uuid4())

        # Analyze new fields
        new_agent_result = analyze_form_questions(
            mapped_form=new_mapped_form,
            profile=session["profile"],
            job_context=session["job_context"],
            thread_id=new_thread_id
        )

        new_fill_actions = prepare_fill_actions(
            new_mapped_form,
            session["profile"],
        )

        # Migrate session to the new thread_id
        save_session(new_thread_id, {
            "fill_actions": new_fill_actions,
            "mapped_form": new_mapped_form,
            "profile": session["profile"],
            "job_context": session["job_context"],
        })
        # Clean up old session
        delete_session(thread_id)
        thread_id = new_thread_id

        status = "next_page"
        interrupt = new_agent_result.get("__interrupt__")

    elif submit_buttons.count() > 0 and submit_buttons.first.is_visible():
        print("Found SUBMIT button, clicking to submit application!")
        submit_buttons.first.click()
        page.wait_for_timeout(3000)
        status = "submitted"

    # Cleanup browser memory if finished
    if status in ("completed", "submitted"):
        try:
            if _active_contexts.get(thread_id):
                _active_contexts[thread_id].close()
        except:
            pass
        _active_contexts.pop(thread_id, None)
        _active_pages.pop(thread_id, None)
        delete_session(thread_id)

    return {
        "success": True,
        "status": status,
        "__interrupt__": interrupt,
        "form": get_session(thread_id).get("mapped_form"),
        "filled": filled,
        "total_actions": len(all_actions),
        "profile_actions": len(profile_actions),
        "agent_actions": len(agent_actions),
        "screenshot": screenshot_path if screenshot_taken else None,
        "thread_id": thread_id,
    }


async def fill_job_form(thread_id: str):
    loop = asyncio.get_running_loop()

    return await loop.run_in_executor(
        get_executor(thread_id),
        fill_job_form_sync,
        thread_id,
    )

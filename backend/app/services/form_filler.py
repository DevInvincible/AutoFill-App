
import os
import re

from patchright.sync_api import Page
from app.schemas.profile import UserProfile


def prepare_fill_actions(
    mapped_form: dict,
    profile: UserProfile,
) -> list:

    profile_data = profile.model_dump()
    actions = []

    supported_types = {
        "text",
        "tel",
        "email",
        "textarea",
        "file",
        "select",
        "checkbox",
        "radio",
        "custom_dropdown",   # needed for country/location/gender dropdowns
    }

    for field in mapped_form.get("fields", []):

        semantic_type = field.get("semantic_type")
        field_type = field.get("type")
        field_id = field.get("id") or ""
        field_name = field.get("name") or ""
        label = field.get("label") or ""

        # ==================================================
        # IGNORE UNSUPPORTED FIELD TYPES
        # ==================================================

        if field_type not in supported_types:
            continue

        # ==================================================
        # FILE FIELDS
        # IMPORTANT:
        # Handle files BEFORE checking semantic_type.
        # ==================================================

        if field_type == "file":

            file_type = None

            field_id_lower = field_id.lower()
            label_lower = label.lower()

            # -----------------------------
            # Resume
            # -----------------------------

            if (
                semantic_type == "resume"
                or field_id_lower == "resume"
                or "resume" in field_id_lower
                or "cv" in field_id_lower
                or "resume" in label_lower
                or "cv" in label_lower
            ):
                file_type = "resume"

            # -----------------------------
            # Cover letter
            # -----------------------------

            elif (
                semantic_type == "cover_letter"
                or field_id_lower == "cover_letter"
                or "cover_letter" in field_id_lower
                or "cover-letter" in field_id_lower
                or "cover" in label_lower
            ):
                file_type = "cover_letter"

            # -----------------------------
            # Unknown file
            # -----------------------------

            if not file_type:
                print(
                    f"SKIPPING UNKNOWN FILE FIELD: "
                    f"{label} | id={field_id}"
                )
                continue

            value = profile_data.get(file_type)

            if not value:
                print(
                    f"NO FILE PROVIDED FOR: "
                    f"{file_type}"
                )
                continue

            actions.append({
                "semantic_type": file_type,
                "field_type": "file",
                "value": value,
                "id": field_id,
                "name": field_name,
                "label": label,

                "is_custom_dropdown": False,

                "aria_expanded": field.get(
                    "aria_expanded"
                ),

                "aria_controls": field.get(
                    "aria_controls"
                ),

                "aria_haspopup": field.get(
                    "aria_haspopup"
                ),
            })

            print(
                f"FILE ACTION CREATED: "
                f"{file_type} → {value}"
            )

            continue

        # ==================================================
        # UNKNOWN FIELDS
        # These will later go to the AI agent.
        # ==================================================

        if (
            not semantic_type
            or semantic_type == "unknown"
        ):
            continue

        # ==================================================
        # GET PROFILE VALUE
        # ==================================================

        if semantic_type == "full_name":
            first = profile_data.get("first_name", "")
            last = profile_data.get("last_name", "")
            value = f"{first} {last}".strip()
        else:
            value = profile_data.get(semantic_type)

        if value is None or value == "":
            print(
                f"[prepare_fill_actions] SKIP: "
                f"semantic_type={semantic_type!r} has no value in profile "
                f"(label={label!r})"
            )
            continue

        # ==================================================
        # NORMAL PROFILE ACTION
        # ==================================================

        actions.append({
            "semantic_type": semantic_type,
            "field_type": field_type,
            "value": value,

            "id": field_id,
            "name": field_name,
            "label": label,

            "is_custom_dropdown": field.get(
                "is_custom_dropdown",
                False,
            ),

            "aria_expanded": field.get(
                "aria_expanded"
            ),

            "aria_controls": field.get(
                "aria_controls"
            ),

            "aria_haspopup": field.get(
                "aria_haspopup"
            ),
        })

    return actions

def find_field(
    page: Page,
    field_id: str | None,
    field_name: str | None,
):

    if field_id:

        try:
            # Prefer visible elements to avoid timeouts on hidden ghost fields
            locator = page.locator(f'[id="{field_id}"]:visible')
            if locator.count() > 0:
                return locator.first

            # Fallback to any matching element
            locator = page.locator(f'[id="{field_id}"]')
            if locator.count() > 0:
                return locator.first

        except Exception:
            pass

    if field_name:

        try:
            locator = page.locator(f'[name="{field_name}"]:visible')
            if locator.count() > 0:
                return locator.first

            locator = page.locator(f'[name="{field_name}"]')
            if locator.count() > 0:
                return locator.first

        except Exception:
            pass

    return None


def normalize_text(value: str) -> str:

    return re.sub(
        r"\s+",
        " ",
        str(value).strip().lower(),
    )


def option_matches(
    wanted: str,
    option_text: str,
) -> bool:

    wanted = normalize_text(wanted)
    option_text = normalize_text(option_text)

    if not wanted or not option_text:
        return False

    # Exact match
    if wanted == option_text:
        return True

    # Substring match
    #
    # Karachi
    #     ↓
    # Karachi, Sindh, Pakistan
    #
    # Pakistan
    #     ↓
    # Karachi, Sindh, Pakistan
    #
    if wanted in option_text:
        return True

    return False


def fill_form(
    page: Page,
    fill_actions: list,
) -> list:

    filled = []

    for action in fill_actions:

        field_id = action.get("id")
        field_name = action.get("name")
        value = action.get("value")
        field_type = action.get("field_type")
        label = action.get("label", "")
        semantic_type = action.get("semantic_type")

        print("\n========================================")
        print(f"PROCESSING: {label}")
        print(f"TYPE: {field_type}")
        print(f"VALUE: {value}")
        print("========================================")

        # ==================================================
        # FIND FIELD
        # ==================================================

        locator = find_field(
            page,
            field_id,
            field_name,
        )

        if locator is None:

            print(
                f"FIELD NOT FOUND: {label}"
            )

            filled.append({
                "semantic_type": semantic_type,
                "label": label,
                "value": value,
                "status": "not_found",
            })

            continue

        try:

            # ==================================================
            # FILE
            # ==================================================

            if field_type == "file":

                if not os.path.exists(str(value)):

                    print(
                        f"FILE NOT FOUND: {value}"
                    )

                    filled.append({
                        "semantic_type": semantic_type,
                        "label": label,
                        "value": value,
                        "status": "skipped",
                        "error": "File not found on server",
                    })

                    continue

                locator.set_input_files(
                    str(value)
                )

                status = "uploaded"

                print(
                    f"UPLOADED: {label}"
                )

            # ==================================================
            # NATIVE SELECT
            # ==================================================

            elif field_type == "select":

                # Try exact string match (value or label)
                select_matched = False
                try:
                    locator.select_option(
                        str(value),
                        timeout=2000
                    )
                    select_matched = True
                except Exception:
                    # Fallback to substring match (e.g. "email@example.com (Primary)")
                    try:
                        locator.select_option(
                            label=re.compile(re.escape(str(value)), re.IGNORECASE),
                            timeout=2000
                        )
                        select_matched = True
                    except Exception:
                        print(
                            f"SELECT FAILED (both exact and regex): "
                            f"{label} → {value}"
                        )

                if select_matched:
                    status = "selected"
                    print(
                        f"SELECTED: "
                        f"{label} → {value}"
                    )
                else:
                    status = "select_failed"
                    print(
                        f"SKIPPED SELECT (no matching option): "
                        f"{label} → {value}"
                    )

            # ==================================================
            # CHECKBOX
            # ==================================================

            elif field_type == "checkbox":

                should_check = bool(value)

                if should_check:

                    if not locator.is_checked():

                        locator.check()

                    status = "checked"

                    print(
                        f"CHECKED: {label}"
                    )

                else:

                    if locator.is_checked():

                        locator.uncheck()

                    status = "unchecked"

                    print(
                        f"UNCHECKED: {label}"
                    )

            # ==================================================
            # RADIO
            # ==================================================

            elif field_type == "radio":

                should_select = bool(value)

                if should_select:

                    locator.check()

                    status = "selected"

                    print(
                        f"RADIO SELECTED: {label}"
                    )

                else:

                    status = "skipped"

                    print(
                        f"RADIO SKIPPED: {label}"
                    )

            # ==================================================
            # CUSTOM DROPDOWN / AUTOCOMPLETE
            # ==================================================

            elif action.get(
                "is_custom_dropdown",
                False,
            ):

                print(
                    f"CUSTOM DROPDOWN: "
                    f"{label} → {value}"
                )

                # ------------------------------------------------
                # PHONE COUNTRY CODE
                # ------------------------------------------------

                if (
                    "iti-" in str(field_id)
                    or "country-listbox"
                    in str(
                        action.get(
                            "aria_controls",
                            "",
                        )
                    )
                    or "dial-code"
                    in str(field_id)
                ):

                    print(
                        f"SKIPPED PHONE CODE: "
                        f"{label}"
                    )

                    status = "skipped_phone_code"

                    filled.append({
                        "semantic_type": semantic_type,
                        "label": label,
                        "value": value,
                        "status": status,
                    })

                    continue

                # ------------------------------------------------
                # SCROLL INTO VIEW
                # Some dropdowns are below the fold — Playwright
                # can click them but the listbox appears off-screen
                # and is missed.
                # ------------------------------------------------

                try:
                    locator.scroll_into_view_if_needed(
                        timeout=3000
                    )
                    page.wait_for_timeout(200)
                except Exception:
                    pass

                # ------------------------------------------------
                # OPEN DROPDOWN
                # ------------------------------------------------

                try:
                    expanded = locator.get_attribute("aria-expanded")
                except Exception:
                    expanded = None

                print(f"CURRENT ARIA EXPANDED: {expanded}")

                if expanded != "true":
                    print(f"OPENING DROPDOWN: {label}")
                    locator.click()
                    page.wait_for_timeout(400)

                # ------------------------------------------------
                # TYPE SEARCH VALUE
                #
                # Detect at runtime whether the combobox element
                # is an <input> (searchable) or a div/button
                # (click-only dropdown).
                #
                # field_type is always "custom_dropdown" here so
                # we cannot rely on it — we evaluate the DOM.
                # ------------------------------------------------

                try:
                    is_input_element = locator.evaluate(
                        "el => el.tagName === 'INPUT'"
                    )
                except Exception:
                    is_input_element = False

                if is_input_element:
                    # Use the first word of the value for search
                    # (shorter = more results, especially for city)
                    search_text = str(value).split(",")[0].strip()
                    print(f"SEARCHING DROPDOWN: {search_text!r}")
                    locator.fill(search_text)
                    # Give async search dropdowns time to fetch
                    # options (country/city can take 1-3 s).
                    page.wait_for_timeout(2500)

                # ------------------------------------------------
                # FIND VISIBLE LISTBOX
                # ------------------------------------------------

                listbox = None

                listbox_selectors = [
                    "[role='listbox']:visible",
                    "ul[role='listbox']",
                    "[aria-label*='listbox']:visible",
                ]

                for lb_sel in listbox_selectors:
                    try:
                        candidate = page.locator(lb_sel).last
                        candidate.wait_for(
                            state="visible",
                            timeout=3000,
                        )
                        listbox = candidate
                        print(f"LISTBOX FOUND via {lb_sel!r}")
                        break
                    except Exception:
                        continue

                if listbox is None:
                    print(f"LISTBOX DID NOT OPEN: {label}")
                    # Clean up ghost text so field doesn't look
                    # half-filled then reset on next interaction.
                    if is_input_element:
                        try:
                            page.keyboard.press("Escape")
                        except Exception:
                            pass
                    filled.append({
                        "semantic_type": semantic_type,
                        "label": label,
                        "value": value,
                        "status": "options_not_found",
                    })
                    continue

                # ------------------------------------------------
                # WAIT FOR OPTIONS — multi-selector fallback
                # ------------------------------------------------

                option_selectors = [
                    "[role='option']",
                    "li[role='option']",
                    "li",
                    "[class*='option']:not([role='combobox'])",
                    "[class*='item']",
                ]

                options = None

                for opt_sel in option_selectors:
                    try:
                        candidate = listbox.locator(opt_sel)
                        candidate.first.wait_for(
                            state="visible",
                            timeout=4000,
                        )
                        if candidate.count() > 0:
                            options = candidate
                            print(
                                f"OPTIONS FOUND via {opt_sel!r}: "
                                f"{candidate.count()} items"
                            )
                            break
                    except Exception:
                        continue

                if options is None or options.count() == 0:
                    print(f"NO OPTIONS LOADED: {label}")
                    try:
                        html = listbox.evaluate("el => el.outerHTML")
                        print(f"\n=== LISTBOX HTML ===\n{html[:800]}\n===\n")
                    except Exception:
                        pass
                    try:
                        page.keyboard.press("Escape")
                    except Exception:
                        pass
                    filled.append({
                        "semantic_type": semantic_type,
                        "label": label,
                        "value": value,
                        "status": "options_not_found",
                    })
                    continue

                # ------------------------------------------------
                # MATCH OPTION
                # ------------------------------------------------

                option_count = options.count()
                selected = False
                wanted = normalize_text(str(value))

                for i in range(min(option_count, 50)):

                    option = options.nth(i)

                    try:
                        if not option.is_visible():
                            continue
                    except Exception:
                        continue

                    try:
                        option_text = option.inner_text().strip()
                    except Exception:
                        continue

                    if not option_text:
                        continue

                    print(f"OPTION [{i}]: {option_text}")

                    if option_matches(wanted, option_text):
                        print(f"MATCH FOUND: {value!r} → {option_text!r}")
                        option.click()
                        print(f"SELECTED: {label} → {option_text}")
                        status = "selected_custom"
                        selected = True
                        page.wait_for_timeout(300)
                        break

                # ------------------------------------------------
                # OPTION NOT FOUND
                # ------------------------------------------------

                if not selected:
                    print(f"OPTION NOT FOUND: {label} → {value}")
                    status = "option_not_found"
                    try:
                        page.keyboard.press("Escape")
                    except Exception:
                        pass


            # ==================================================
            # NORMAL INPUT
            # ==================================================

            else:

                locator.fill(
                    str(value)
                )

                status = "filled"

                print(
                    f"FILLED: "
                    f"{label} → {value}"
                )

            # ==================================================
            # RESULT
            # ==================================================

            filled.append({
                "semantic_type": semantic_type,
                "label": label,
                "value": value,
                "status": status,
            })

        except Exception as e:

            print(
                f"FAILED: "
                f"{label} → {e}"
            )

            filled.append({
                "semantic_type": semantic_type,
                "label": label,
                "value": value,
                "status": "failed",
                "error": str(e),
            })

    return filled


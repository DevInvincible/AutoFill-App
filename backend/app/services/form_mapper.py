import re


def normalize_text(text: str) -> str:
    """
    Normalize text so we can compare labels reliably.
    """
    if not text:
        return ""

    text = text.lower().strip()

    # Remove required markers
    text = text.replace("*", "")

    # Replace underscores with spaces
    text = text.replace("_", " ")

    # Replace multiple spaces
    text = re.sub(r"\s+", " ", text)

    return text


def is_question(label: str) -> bool:
    """
    Detect fields that are questions rather than
    straightforward profile fields.
    """

    label = normalize_text(label)

    question_patterns = [
        "did you",
        "have you",
        "are you",
        "do you",
        "would you",
        "can you",
        "will you",
        "why",
        "how",
        "please describe",
        "please explain",
        "tell us",
        "select",
        "choose",
        "what influenced",
        "what is",
        "which",
    ]

    return any(
        pattern in label
        for pattern in question_patterns
    )


def detect_semantic_type(
    label: str,
    field_type: str,
) -> str:

    label = normalize_text(label)
    field_type = normalize_text(field_type)


    # -------------------------
    # Basic personal information
    # -------------------------

    if (
        "first name" in label
        or "given name" in label
        or label in ["fname", "first"]
    ):
        return "first_name"

    if (
        "last name" in label
        or "surname" in label
        or "family name" in label
        or label in ["lname", "last"]
    ):
        return "last_name"

    if (
        label == "email"
        or "email address" in label
        or "email" in label
    ):
        return "email"

    if (
        "phone" in label
        or "mobile number" in label
        or "telephone" in label
    ):
        return "phone"

    if (
        "location" in label
        or "city" in label
        or "current city" in label
    ):
        return "location"

    if "country" in label:
        return "country"

    # -------------------------
    # Professional information
    # -------------------------

    if (
        "current employer" in label
        or "current company" in label
        or "employer name" in label
    ):
        return "current_employer"

    if (
        "job title" in label
        or "current title" in label
        or "position title" in label
    ):
        return "current_job_title"

    if (
        "linkedin" in label
        or "linkedin profile" in label
        or "linkedin url" in label
    ):
        return "linkedin"

    # -------------------------
    # Salary
    # -------------------------

    if (
        "salary expectations" in label
        or "expected salary" in label
        or "salary expectation" in label
        or "expected compensation" in label
        or "desired salary" in label
    ):
        return "salary_expectation"

    if (
        "current monthly salary" in label
        or "current salary" in label
        or "current compensation" in label
    ):
        return "current_salary"

    # -------------------------
    # Documents
    # -------------------------

    if field_type == "file":

        if "resume" in label or "cv" in label:
            return "resume"

        if "cover letter" in label or "cover" in label:
            return "cover_letter"

    # Questions are not profile fields.
    # The agent will answer these later.
    # IMPORTANT: this check must run BEFORE broad keyword matches
    # like "experience" to avoid misclassifying questions such as
    # "Describe your experience with Python" as profile fields.
    if is_question(label):
        return "unknown"

    # -------------------------
    # Other common fields
    # -------------------------

    if "gender" in label:
        return "gender"

    if (
        label == "experience"
        or "years of experience" in label
        or "experience level" in label
        or "total experience" in label
        or "work experience" in label
    ):
        return "experience"

    return "unknown"


def is_semantic_id(text: str) -> bool:
    """
    Check if an id/name looks like a semantic field name
    instead of a technical ID.
    """

    if not text:
        return False

    text = str(text).lower()

    # Technical IDs
    if text.startswith("question_"):
        return False

    if text.startswith("iti-"):
        return False

    if text.startswith("g-recaptcha"):
        return False

    if text.isdigit():
        return False

    semantic_keywords = [
        "name",
        "first",
        "last",
        "email",
        "phone",
        "mobile",
        "address",
        "city",
        "country",
        "location",
        "resume",
        "cover",
        "linkedin",
        "portfolio",
        "github",
        "salary",
        "experience",
        "education",
        "university",
        "college",
    ]

    return any(
        keyword in text
        for keyword in semantic_keywords
    )


def get_field_label(field: dict) -> str:
    """
    Get the best available label for a field.
    """

    label = field.get("label", "")

    if label:
        return label

    placeholder = field.get("placeholder", "")

    if placeholder:
        return placeholder

    potential_label = (
        field.get("name")
        or field.get("id")
        or ""
    )

    if is_semantic_id(potential_label):
        return potential_label

    return ""


def map_normal_field(
    field: dict,
    field_type: str | None = None,
) -> dict:
    """
    Map a normal input/select/radio field.
    """

    label = get_field_label(field)

    actual_type = (
        field_type
        or field.get("type", "")
    )

    semantic_type = detect_semantic_type(
        label,
        actual_type,
    )

    return {
        **field,
        "type": actual_type,
        "label": label,
        "semantic_type": semantic_type,
    }


def map_checkbox_fields(
    checkbox_fields: list,
) -> list:
    """
    Map checkboxes.

    Important:
    Individual checkbox labels must NOT be treated as
    profile fields.

    Example:

        "I saw the job posting on LinkedIn..."

    must NOT become:

        semantic_type = "linkedin"

    because it is an answer option.

    Instead, checkboxes are grouped into a question.
    """

    mapped = []

    # ---------------------------------------------------------
    # Group by HTML name when available.
    #
    # Most checkbox groups use the same name:
    #
    # motivation[]
    #
    # or:
    #
    # question_123[]
    # ---------------------------------------------------------

    groups = {}

    standalone = []

    for field in checkbox_fields:

        name = field.get("name")

        if name:
            groups.setdefault(
                name,
                [],
            ).append(field)
        else:
            standalone.append(field)

    # ---------------------------------------------------------
    # Process groups
    # ---------------------------------------------------------

    for group_name, fields in groups.items():

        # Determine the question from the first checkbox.
        #
        # Ideally the extractor should provide a
        # question/group label.
        #
        # Supported keys:
        #   group_label
        #   question
        #   fieldset_label
        #   parent_label
        #   label
        #

        group_label = ""

        for field in fields:

            group_label = (
                field.get("group_label")
                or field.get("question")
                or field.get("fieldset_label")
                or field.get("parent_label")
                or ""
            )

            if group_label:
                break

        # -----------------------------------------------------
        # If extractor did not provide group label,
        # use the common label if available.
        # -----------------------------------------------------

        if not group_label:

            possible_labels = [
                field.get("label", "")
                for field in fields
            ]

            # Do not use an option label as the question.
            # We leave it blank and let the agent/extractor
            # improve this later.
            group_label = ""

        options = []

        for field in fields:

            option_label = field.get(
                "label",
                "",
            )

            options.append({
                "label": option_label,
                "value": field.get(
                    "value"
                ),
                "id": field.get(
                    "id"
                ),
                "name": field.get(
                    "name"
                ),
            })

        mapped.append({
            "type": "checkbox_group",
            "semantic_type": "unknown",
            "label": group_label,
            "name": group_name,
            "options": options,
            "fields": fields,
        })

    # ---------------------------------------------------------
    # Standalone checkboxes
    # ---------------------------------------------------------

    for field in standalone:

        label = field.get(
            "label",
            "",
        )

        mapped.append({
            **field,
            "type": "checkbox",
            "label": label,

            # NEVER classify an arbitrary checkbox option
            # as a profile field.
            "semantic_type": "unknown",
        })

    return mapped


def map_form_fields(form_data: dict) -> dict:
    """
    Convert raw Playwright form data into normalized fields.

    Normal fields become individual fields.

    Checkbox fields are grouped into checkbox_group objects
    so the future agent can decide which options to select.
    """

    mapped_fields = []

    # =========================================================
    # INPUTS
    # =========================================================

    for field in form_data.get(
    "inputs",
    [],
    ):

    # Custom dropdown inputs are already represented
    # in custom_dropdowns.
        if field.get("is_custom_dropdown"):
            continue

        mapped_fields.append(
            map_normal_field(field)
        )

    # =========================================================
    # TEXTAREAS
    # =========================================================

    for field in form_data.get(
        "textareas",
        [],
    ):

        mapped_fields.append(
            map_normal_field(
                field,
                "textarea",
            )
        )

    # =========================================================
    # SELECTS
    # =========================================================

    for field in form_data.get(
        "selects",
        [],
    ):

        mapped_fields.append(
            map_normal_field(
                field,
                "select",
            )
        )
    # =========================================================
    # CUSTOM DROPDOWNS
    # =========================================================

    for field in form_data.get(
        "custom_dropdowns",
        [],
    ):

        label = get_field_label(field)

        mapped_fields.append({
        **field,
        "type": "custom_dropdown",
        "label": label,
        "semantic_type": detect_semantic_type(
            label,
            "custom_dropdown",
        ),
    })

    # =========================================================
    # RADIOS
    # =========================================================

    for field in form_data.get(
        "radios",
        [],
    ):

        mapped_fields.append(
            map_normal_field(
                field,
                "radio",
            )
        )

    # =========================================================
    # CHECKBOXES
    # =========================================================

    checkbox_fields = form_data.get(
        "checkboxes",
        [],
    )

    mapped_fields.extend(
        map_checkbox_fields(
            checkbox_fields
        )
    )

    # =========================================================
    # PROFILE FIELDS
    # =========================================================

    profile_fields = [
        field
        for field in mapped_fields
        if field.get(
            "semantic_type"
        ) != "unknown"
    ]

    # =========================================================
    # QUESTIONS
    # =========================================================

    unanswered_questions = []

    for field in mapped_fields:

        semantic_type = field.get(
            "semantic_type"
        )

        if semantic_type != "unknown":
            continue

        # Checkbox group
        if field.get("type") == "checkbox_group":

            if field.get("label"):
                unanswered_questions.append(
                    field
                )

            continue

        # Normal question
        if field.get("label"):

            unanswered_questions.append(
                field
            )

    return {
        "fields": mapped_fields,
        "total_fields": len(
            mapped_fields
        ),
        "profile_fields": profile_fields,
        "unanswered_questions": unanswered_questions,
    }


def find_apply_elements(page_data):
    matches = []

    for link in page_data.get("links", []):
        text = (link.get("text") or "").lower()
        aria = (link.get("ariaLabel") or "").lower()

        if "apply" in text or "apply" in aria:
            matches.append({
                "type": "link",
                "text": link.get("text"),
                "href": link.get("href"),
            })

    for button in page_data.get("buttons", []):
        text = (button.get("text") or "").lower()
        aria = (button.get("ariaLabel") or "").lower()

        if "apply" in text or "apply" in aria:
            matches.append({
                "type": "button",
                "text": button.get("text"),
                "ariaLabel": button.get("ariaLabel"),
            })

    return matches
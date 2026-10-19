DISCLAIMER = "Genie is not a medical service. For questions about care, please speak with the care team."
SAMPLE_LABEL = "Sample. A demonstration Wish Maker, not a real person."

SOURCE_LABELS = {
    "told": "Told by family",
    "likely": "Likely from their era and region",
    "reacted": "They reacted to this",
    "ai-only": "Suggested by AI, not in Qloo",
}

MATCH_BASIS_LABELS = {
    "qloo": "Matched through Qloo's taste graph",
    "text": "Matched by name, not through Qloo's taste graph",
    "type": "Suggested for what they offer. No shared favorites found yet",
}

VERIFICATION_PLAN = [
    "Every Wish Maker applies with a short profile and agrees to a code of conduct.",
    "A person reviews each application before anyone is shown to a family.",
    "Remote wishes, such as a recorded song, a recipe, or a message, come first.",
    "In-person wishes go only to makers who have passed a reference check.",
    "No contact details are shared until both the family and the maker agree.",
    "Either side can decline or withdraw at any time. A family concern pauses a maker right away.",
]

PRIVACY_POINTS = [
    "Genie asks only who the person is and what they love. It never asks about illness, diagnosis, or medication.",
    "We keep a first name or nickname, birth year, region, language, and favorites. No surnames, addresses, or ID numbers.",
    "There are no accounts. Your private link is the key, so keep it safe.",
    "You can delete everything at any time, and data is removed automatically when its retention period ends.",
    "A shared Wish Book can be switched off whenever you like.",
    "Answers you type are sent to a third-party AI service to pick out the names of songs, dishes, and places.",
    "If you open the comparison with a general AI, the first name, birth year, region, language, favorites, and family notes you entered are sent to that AI service too.",
]

RETENTION_OPTIONS = (7, 30, 90, 365)

MAKER_STATUS_MESSAGES = {
    "pending": "Your application is being reviewed. You will hear from us soon.",
    "approved": "Your profile is active. Families can find you and send requests.",
    "paused": "Your profile is paused. Families cannot see you until you resume.",
    "rejected": "We were not able to approve this profile.",
    "suspended": "Your profile is on hold while we review some feedback. We will be in touch.",
}
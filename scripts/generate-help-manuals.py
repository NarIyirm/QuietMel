from pathlib import Path
import shutil

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
PUBLIC_DIR = ROOT / "public" / "help"

INK = colors.HexColor("#23312F")
MUTED = colors.HexColor("#596D68")
ACCENT = colors.HexColor("#087C78")
ACCENT_DARK = colors.HexColor("#05615E")
SOFT = colors.HexColor("#E8F4F1")
SURFACE = colors.HexColor("#F5F7F6")
LINE = colors.HexColor("#D7E1DE")
WHITE = colors.white


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=26,
            leading=31,
            textColor=INK,
            spaceAfter=7 * mm,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=11,
            leading=16,
            textColor=MUTED,
            spaceAfter=8 * mm,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=INK,
            spaceBefore=4 * mm,
            spaceAfter=3 * mm,
        ),
        "h3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11.5,
            leading=15,
            textColor=INK,
            spaceAfter=1.5 * mm,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14.5,
            textColor=INK,
            spaceAfter=3 * mm,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=MUTED,
        ),
        "step": ParagraphStyle(
            "Step",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=INK,
        ),
        "cover_tag": ParagraphStyle(
            "CoverTag",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            textColor=ACCENT_DARK,
            alignment=TA_CENTER,
        ),
    }


STYLES = styles()


def page_decoration(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(ACCENT)
    canvas.roundRect(18 * mm, height - 19 * mm, 8 * mm, 8 * mm, 2 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawCentredString(22 * mm, height - 16.2 * mm, "Q")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(29 * mm, height - 16.5 * mm, "QuietMel Help Library")
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 16 * mm, width - 18 * mm, 16 * mm)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10.5 * mm, doc.title)
    canvas.drawRightString(width - 18 * mm, 10.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


class ManualDoc(BaseDocTemplate):
    def __init__(self, filename, title):
        super().__init__(
            filename,
            pagesize=A4,
            title=title,
            author="QuietMel",
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=25 * mm,
            bottomMargin=21 * mm,
        )
        self.title = title
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="content",
        )
        self.addPageTemplates(PageTemplate(id="manual", frames=[frame], onPage=page_decoration))


def cover(title, subtitle, reading_time):
    return [
        Spacer(1, 20 * mm),
        Table(
            [[Paragraph(f"{reading_time} MIN READ", STYLES["cover_tag"])]],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), SOFT),
                ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#B9DAD3")),
                ("LEFTPADDING", (0, 0), (-1, -1), 7 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 2.2 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]),
            hAlign="LEFT",
        ),
        Spacer(1, 9 * mm),
        Paragraph(title, STYLES["title"]),
        Paragraph(subtitle, STYLES["subtitle"]),
        Table(
            [[
                Paragraph("Built for quieter decisions", STYLES["h3"]),
                Paragraph(
                    "QuietMel combines pedestrian activity, place search and walking routes in one map-first experience.",
                    STYLES["small"],
                ),
            ]],
            colWidths=[52 * mm, 102 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
                ("BOX", (0, 0), (-1, -1), 0.7, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 5 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5 * mm),
            ]),
        ),
        Spacer(1, 12 * mm),
    ]


def heading(text):
    return Paragraph(text, STYLES["h2"])


def body(text):
    return Paragraph(text, STYLES["body"])


def steps(items):
    rows = []
    for index, (title, text) in enumerate(items, start=1):
        number = Table(
            [[Paragraph(str(index), ParagraphStyle(
                f"StepNumber{index}",
                parent=STYLES["h3"],
                textColor=WHITE,
                alignment=TA_CENTER,
            ))]],
            colWidths=[8 * mm],
            rowHeights=[8 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), ACCENT),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]),
        )
        content = Paragraph(f"<b>{title}</b><br/>{text}", STYLES["step"])
        rows.append([number, content])
    table = Table(rows, colWidths=[12 * mm, 142 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 4 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 * mm),
        ("LINEBELOW", (1, 0), (1, -2), 0.5, LINE),
    ]))
    return table


def info_box(title, text):
    return KeepTogether([
        Spacer(1, 3 * mm),
        Table(
            [[Paragraph(title, STYLES["h3"]), Paragraph(text, STYLES["small"])]],
            colWidths=[43 * mm, 111 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), SOFT),
                ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#B9DAD3")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
            ]),
        ),
    ])


MANUALS = [
    {
        "filename": "quietmel-quick-start.pdf",
        "title": "QuietMel Quick Start",
        "subtitle": "A short guide to opening the map, checking crowd conditions and finding a quieter place.",
        "reading_time": 4,
        "sections": [
            (
                "Start with your location",
                [
                    ("Allow location access", "Your browser asks before QuietMel uses your device location. Choose Allow to enable nearby places and routes from your current position."),
                    ("Check the map", "The default heatmap shows the latest available pedestrian activity around Melbourne."),
                    ("Refresh when needed", "Use the round refresh control near the lower-right map controls to request the latest crowd snapshot."),
                ],
            ),
            (
                "Choose what the map shows",
                [
                    ("Open map details", "Use the layers control to switch between Heatmap, Sensors and Combined views."),
                    ("Inspect a sensor", "In Sensors or Combined view, select a map marker to see its location name and current count."),
                    ("Preview the next six hours", "Select Forecast to animate predicted pedestrian activity from the current time."),
                ],
            ),
            (
                "Find a place or route",
                [
                    ("Search for a destination", "Open the search field, enter a start and destination, then choose a suggestion from the list."),
                    ("Compare alternatives", "QuietMel ranks available walking routes. The selected route is solid; alternatives are shown with lower emphasis."),
                    ("Find quiet nearby", "Use Find quiet nearby to locate a nearby park, library, cafe or similar place and request the fastest walking route."),
                ],
            ),
        ],
        "note": ("Location permission", "If permission is denied, features that require your current position remain unavailable. Enable location for quietmel.vercel.app in your browser settings, then try again."),
    },
    {
        "filename": "quietmel-map-and-crowd-data.pdf",
        "title": "Map and Crowd Data",
        "subtitle": "Understand the live map layers, sensor information and six-hour pedestrian forecast.",
        "reading_time": 5,
        "sections": [
            (
                "Live crowd view",
                [
                    ("Heatmap", "Colour intensity summarises the latest available pedestrian counts. Higher intensity indicates busier areas."),
                    ("Sensors", "Markers show stored sensor locations. Select a marker to inspect its place name, count and available location details."),
                    ("Combined", "The heatmap stays beneath sensor markers and detail panels so both context and individual readings remain visible."),
                ],
            ),
            (
                "Refresh and data timing",
                [
                    ("Automatic updates", "QuietMel periodically requests a recent pedestrian snapshot while the map is active."),
                    ("Manual refresh", "The refresh control asks the backend for a fresh copy instead of relying on the current browser result."),
                    ("Latest available data", "Sensor feeds can report with a short delay. Treat the map as a recent activity guide, not an exact headcount at your position."),
                ],
            ),
            (
                "Forecast mode",
                [
                    ("Six-hour horizon", "Forecast begins from the current time and presents expected pedestrian activity for the next six hours."),
                    ("How to read it", "Use play, pause and the time controls to compare how activity may change across the map."),
                    ("Zero values", "A value of zero means the model expects no pedestrians for that sensor and time period. It is not treated as missing data."),
                ],
            ),
        ],
        "note": ("Data sources", "Live observations come from the City of Melbourne pedestrian sensor feed. Forecast profiles are read from QuietMel's database and are based on two years of rolling historical data."),
    },
    {
        "filename": "quietmel-routes-and-quiet-places.pdf",
        "title": "Routes and Quiet Places",
        "subtitle": "Plan a walking route, compare alternatives and find a nearby place with a calmer setting.",
        "reading_time": 5,
        "sections": [
            (
                "Plan a walking route",
                [
                    ("Choose the start", "Keep Your location selected or type a different starting place. Location-based actions ask for permission when needed."),
                    ("Choose the destination", "Type at least two characters and select a Google Places suggestion. A typed label alone is not enough to calculate a route."),
                    ("Find quiet route", "QuietMel requests walking alternatives and ranks them using travel time, distance and predicted pedestrian exposure."),
                ],
            ),
            (
                "Compare route options",
                [
                    ("Recommended first", "The highest-ranked balanced option appears first and is selected automatically."),
                    ("Read the map", "The selected route uses a highlighted solid line. Other available routes use lower-emphasis dashed lines."),
                    ("Change route", "Select another route card or line to review its duration, distance and quietness score before starting navigation."),
                ],
            ),
            (
                "Find quiet nearby",
                [
                    ("Use your current position", "The feature always starts from your device location. It does not silently substitute a random or saved position."),
                    ("Search suitable places", "QuietMel looks for nearby parks, libraries, cafes, gardens and other categories associated with calmer visits."),
                    ("Follow the fastest route", "After choosing the nearest suitable place, QuietMel displays the fastest walking route returned by Google Maps."),
                ],
            ),
        ],
        "note": ("If location is blocked", "The action stops and explains that location permission is required. Open Safari or browser website settings, allow Location for QuietMel, then run the action again."),
    },
]


def build_manual(config):
    output_path = OUTPUT_DIR / config["filename"]
    doc = ManualDoc(str(output_path), config["title"])
    story = cover(
        config["title"],
        config["subtitle"],
        config["reading_time"],
    )
    for index, (section_title, section_steps) in enumerate(config["sections"]):
        if index == 1:
            story.append(PageBreak())
        story.extend([
            heading(section_title),
            steps(section_steps),
            Spacer(1, 3 * mm),
        ])
    story.append(info_box(*config["note"]))
    doc.build(story)
    shutil.copy2(output_path, PUBLIC_DIR / config["filename"])
    return output_path


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for config in MANUALS:
        print(build_manual(config))


if __name__ == "__main__":
    main()

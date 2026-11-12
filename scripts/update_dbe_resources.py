#!/usr/bin/env python3
"""Refresh LearnZA's catalogue from public DBE resource listings."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import URLError
from urllib.parse import parse_qs, urljoin, urlparse
from urllib.request import Request, urlopen

DBE_ORIGIN = "https://www.education.gov.za"
WORKBOOKS_URL = (
    f"{DBE_ORIGIN}/Curriculum/LearningandTeachingSupportMaterials(LTSM)/Workbooks.aspx"
)
DIGITAL_CONTENT_URL = (
    f"{DBE_ORIGIN}/Curriculum/LearningandTeachingSupportMaterials(LTSM)/DigitalContent.aspx"
)
STATE_OWNED_TEXTBOOKS_URL = (
    f"{DBE_ORIGIN}/Curriculum/LearningandTeachingSupportMaterials(LTSM)/"
    "DigitalContent/StateOwnedTextbooksGrade10to12.aspx"
)
MIND_THE_GAP_URL = (
    f"{DBE_ORIGIN}/Curriculum/LearningandTeachingSupportMaterials(LTSM)/MindtheGapStudyGuides.aspx"
)
NSC_EXAMS_URL = (
    f"{DBE_ORIGIN}/Curriculum/NationalSeniorCertificate(NSC)Examinations/tabid/338/Default.aspx"
)
CAPS_URL = f"{DBE_ORIGIN}/Curriculum/CurriculumAssessmentPolicyStatements(CAPS).aspx"
USER_AGENT = "LearnZA resource catalogue/1.0 (links to official DBE materials)"
MAX_HTML_BYTES = 12 * 1024 * 1024
TEACHER_RESOURCE_PATTERN = re.compile(
    r"\bteachers?\b|\btg\b|onderwysers|leerdersgids",
    flags=re.IGNORECASE,
)


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[dict[str, str]] = []
        self._anchor: dict[str, object] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            href = dict(attrs).get("href") or ""
            self._anchor = {"href": href, "text": []}

    def handle_data(self, data: str) -> None:
        if self._anchor is not None:
            self._anchor["text"].append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._anchor is not None:
            text = " ".join(" ".join(self._anchor["text"]).split())
            self.links.append({"href": self._anchor["href"], "text": text})
            self._anchor = None


class MaterialTableParser(HTMLParser):
    def __init__(self, source: str, year: int | None = None, term: str = "") -> None:
        super().__init__(convert_charrefs=True)
        self.source = source
        self.year = year
        self.term = term
        self.heading_tag: str | None = None
        self.heading_parts: list[str] = []
        self.grade: int | None = 12 if source == "mind-gap" else None
        self.grades = [12] if source == "mind-gap" else []
        self.topic = "Mind the Gap study guide" if source == "mind-gap" else ""
        self.row: dict[str, object] | None = None
        self.cell_parts: list[str] | None = None
        self.anchor: dict[str, object] | None = None
        self.records: list[dict[str, object]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"h1", "h2", "h3", "h4"}:
            self.heading_tag = tag
            self.heading_parts = []
        if tag == "tr":
            self.row = {"cells": [], "links": []}
            self.cell_parts = None
        elif tag == "td" and self.row is not None:
            self.cell_parts = []
        if tag == "a" and self.row is not None:
            self.anchor = {"href": dict(attrs).get("href") or "", "parts": []}

    def handle_data(self, data: str) -> None:
        if self.heading_tag is not None:
            self.heading_parts.append(data)
        if self.cell_parts is not None:
            self.cell_parts.append(data)
        if self.anchor is not None:
            self.anchor["parts"].append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self.anchor is not None and self.row is not None:
            link_text = " ".join(" ".join(self.anchor["parts"]).split())
            self.row["links"].append({"href": self.anchor["href"], "text": link_text})
            self.anchor = None
        if tag == "td" and self.row is not None and self.cell_parts is not None:
            self.row["cells"].append(" ".join(" ".join(self.cell_parts).split()))
            self.cell_parts = None
        if tag == "tr" and self.row is not None:
            self._finish_row()
            self.row = None
            self.cell_parts = None
            self.anchor = None
        if tag == self.heading_tag and self.heading_tag is not None:
            self._update_heading(
                self.heading_tag,
                " ".join(" ".join(self.heading_parts).split()),
            )
            self.heading_tag = None
            self.heading_parts = []

    def _update_heading(self, tag: str, heading: str) -> None:
        match = re.search(
            r"\bgrade\s*(\d{1,2})(?:\s*(?:-|–|to)\s*(\d{1,2}))?\b",
            heading,
            flags=re.IGNORECASE,
        )
        if match:
            first = int(match.group(1))
            last = int(match.group(2) or first)
            self.grades = list(range(first, last + 1))
            self.grade = first if len(self.grades) == 1 else None
            self.topic = heading[match.end() :].strip(" :-–") or "Learning materials"
        elif self.source == "mind-gap":
            self.topic = "Mind the Gap study guide"
        elif tag == "h2":
            self.grade = None
            self.grades = []
            self.topic = ""

    def _finish_row(self) -> None:
        cells = self.row["cells"]
        if not self.row["links"]:
            return
        links = self.row["links"]
        title_link = next(
            (
                link
                for link in links
                if link["text"]
                and link["text"].casefold() not in {"download", "view"}
                and "linkclick.aspx" in link["href"].casefold()
            ),
            None,
        )
        if title_link is None:
            return

        title = title_link["text"]
        if TEACHER_RESOURCE_PATTERN.search(title):
            return
        modified = parse_modified_date(cells[2] if len(cells) > 2 else "")
        grades = self.grades or ([self.grade] if self.grade else [])
        if not grades:
            return

        for grade in grades:
            if not 1 <= grade <= 12:
                continue
            subject = normalize_subject(self.topic, self.source)
            display_title = f"{self.topic} — {title}" if self.topic else title
            description = (
                f"Official DBE {self.topic.lower() or subject.lower()} material for Grade {grade}"
                f"{f', {self.term.lower()}' if self.term else ''}."
            )
            if modified:
                description += f" Listed as updated {modified}."
            self.records.append(
                make_record(
                    title=display_title,
                    description=description,
                    subject=subject,
                    grade=grade,
                    url=urljoin(DBE_ORIGIN, title_link["href"]),
                    updated=modified,
                    year=self.year,
                    source_name="South African Department of Basic Education",
                    kind="official",
                )
            )


def normalize_subject(subject: str, source: str = "") -> str:
    lowered = subject.casefold()
    if any(word in lowered for word in ("math", "numeracy", "wiskunde")):
        return "Maths"
    if any(word in lowered for word in ("science", "technology", "natuurwetenskap")):
        return "Science & technology"
    if "business" in lowered or "besigheid" in lowered:
        return "Business studies"
    if any(word in lowered for word in ("language", "literacy", "english", "afrikaans")):
        return "Languages & literacy"
    if source == "mind-gap" or "study guide" in lowered or "mind the gap" in lowered:
        return "Study guides"
    return "Other resources"


def parse_modified_date(value: str) -> str | None:
    for pattern in ("%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value.strip(), pattern).date().isoformat()
        except ValueError:
            continue
    return None


def make_record(
    *,
    title: str,
    description: str,
    subject: str,
    grade: int,
    url: str,
    updated: str | None,
    year: int | None,
    source_name: str,
    kind: str,
) -> dict[str, object]:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "www.education.gov.za":
        raise ValueError(f"Refusing a non-DBE resource URL: {url}")
    identity = f"{grade}|{title}|{url}".encode("utf-8")
    return {
        "id": f"dbe-{hashlib.sha256(identity).hexdigest()[:16]}",
        "title": title,
        "description": description,
        "subject": subject,
        "grade": grade,
        "gradeLabel": f"Grade {grade}",
        "sourceUrl": url,
        "sourceName": source_name,
        "updatedAt": updated,
        "year": year,
        "kind": kind,
    }


def fetch_html(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "www.education.gov.za":
        raise ValueError(f"Refusing to fetch a non-DBE URL: {url}")
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urlopen(request, timeout=45) as response:
        final_url = urlparse(response.geturl())
        if final_url.scheme != "https" or final_url.hostname != "www.education.gov.za":
            raise ValueError(f"DBE listing redirected outside the official site: {url}")
        body = response.read(MAX_HTML_BYTES + 1)
        if len(body) > MAX_HTML_BYTES:
            raise ValueError(f"DBE page exceeded the {MAX_HTML_BYTES}-byte limit: {url}")
        return body.decode(response.headers.get_content_charset() or "utf-8", "replace")


def parse_links(html: str) -> list[dict[str, str]]:
    parser = LinkParser()
    parser.feed(html)
    return parser.links


def resolve_workbook_page(href: str, page_url: str) -> str | None:
    click_url = urljoin(page_url, href)
    parsed = urlparse(click_url)
    if parsed.hostname != "www.education.gov.za":
        return None
    target = parse_qs(parsed.query).get("link", [""])[0]
    if not target:
        return None
    if target.isdigit():
        return None
    target_url = urljoin(DBE_ORIGIN + "/", target)
    target_parsed = urlparse(target_url)
    if target_parsed.scheme != "https" or target_parsed.hostname != "www.education.gov.za":
        return None
    if not target_parsed.path.casefold().endswith(".aspx"):
        return None
    return target_url


def scrape_workbooks(current_year: int) -> list[dict[str, object]]:
    html = fetch_html(WORKBOOKS_URL)
    links = parse_links(html)
    candidates: list[tuple[int, str, str]] = []
    for link in links:
        year_match = re.search(r"\b(20\d{2})\b", link["text"])
        if not year_match or "workbook" not in link["text"].casefold():
            continue
        year = int(year_match.group(1))
        target = resolve_workbook_page(link["href"], WORKBOOKS_URL)
        if target:
            candidates.append((year, link["text"], target))

    eligible_years = [year for year, _, _ in candidates if year <= current_year]
    newest_year = max(eligible_years or [year for year, _, _ in candidates], default=None)
    if newest_year is None:
        raise ValueError("The DBE workbook page did not list any year-specific workbook pages.")

    records: list[dict[str, object]] = []
    for year, title, page_url in candidates:
        if year != newest_year:
            continue
        term_match = re.search(r"term[s]?\s*([1-4])\s*(?:and|&|-)\s*([1-4])", title, re.IGNORECASE)
        term = f"terms {term_match.group(1)} and {term_match.group(2)}" if term_match else ""
        parser = MaterialTableParser("workbooks", year=year, term=term)
        parser.feed(fetch_html(page_url))
        records.extend(parser.records)

    if not records:
        raise ValueError(f"No Grade 1–12 resources were found on the {newest_year} workbook pages.")
    return records


def scrape_listing(url: str, source: str, year: int | None = None) -> list[dict[str, object]]:
    parser = MaterialTableParser(source, year=year)
    parser.feed(fetch_html(url))
    return parser.records


def scrape_state_owned_textbooks() -> list[dict[str, object]]:
    resources = []
    for link in parse_links(fetch_html(STATE_OWNED_TEXTBOOKS_URL)):
        if "linkclick.aspx" not in link["href"].casefold():
            continue
        title = link["text"]
        if not title or TEACHER_RESOURCE_PATTERN.search(title):
            continue
        grade_match = re.search(r"\b(?:grade|graad)\s*(\d{1,2})\b", title, re.IGNORECASE)
        if not grade_match:
            continue
        grade = int(grade_match.group(1))
        if not 1 <= grade <= 12:
            continue
        display_title = re.sub(
            r"^(?:grade|graad)\s*\d{1,2}\s*[-–:]?\s*",
            "",
            title,
            flags=re.IGNORECASE,
        ).strip() or title
        resources.append(
            make_record(
                title=display_title,
                description=f"Official DBE learner textbook or study material for Grade {grade}.",
                subject=normalize_subject(title),
                grade=grade,
                url=urljoin(STATE_OWNED_TEXTBOOKS_URL, link["href"]),
                updated=None,
                year=None,
                source_name="South African Department of Basic Education",
                kind="official",
            )
        )
    return resources


def official_grade_fallback(grade: int) -> dict[str, object]:
    if grade <= 9:
        url = WORKBOOKS_URL
        title = "DBE workbook catalogue"
        description = (
            f"Official Department of Basic Education workbooks for Grades 1–9. "
            f"Open the DBE catalogue and choose Grade {grade}."
        )
    elif grade == 12:
        url = MIND_THE_GAP_URL
        title = "DBE Mind the Gap study guides"
        description = "Grade 12 CAPS-aligned DBE study guides; the source listing includes languages and subjects."
    else:
        url = CAPS_URL
        title = "DBE CAPS curriculum"
        description = (
            f"Official CAPS curriculum and assessment guidance for Grade {grade}. "
            "Open the DBE listing to find current subject materials."
        )
    return make_record(
        title=title,
        description=description,
        subject="Study guides",
        grade=grade,
        url=url,
        updated=None,
        year=None,
        source_name="South African Department of Basic Education",
        kind="catalogue",
    )


def build_catalogue() -> dict[str, object]:
    current_year = date.today().year
    resources = scrape_workbooks(current_year)
    resources.extend(scrape_listing(DIGITAL_CONTENT_URL, "digital"))
    resources.extend(scrape_state_owned_textbooks())
    resources.extend(scrape_listing(MIND_THE_GAP_URL, "mind-gap"))

    resources.append(
        make_record(
            title="NSC past examination papers — Grade 12",
            description="Official DBE examination information and past-paper links for National Senior Certificate learners.",
            subject="Study guides",
            grade=12,
            url=NSC_EXAMS_URL,
            updated=None,
            year=None,
            source_name="South African Department of Basic Education",
            kind="catalogue",
        )
    )

    present_grades = {resource["grade"] for resource in resources}
    for grade in range(1, 13):
        if grade not in present_grades:
            resources.append(official_grade_fallback(grade))

    unique_resources: dict[str, dict[str, object]] = {}
    for resource in resources:
        key = str(resource["id"])
        unique_resources[key] = resource
    resources = list(unique_resources.values())
    resources.sort(
        key=lambda resource: (
            resource["updatedAt"] or "",
            resource["year"] or 0,
            resource["grade"],
            resource["title"],
        ),
        reverse=True,
    )
    return {
        "source": "South African Department of Basic Education",
        "sourceUrl": DBE_ORIGIN,
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "resources": resources,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "materials.json",
        help="Path for the generated JSON catalogue.",
    )
    args = parser.parse_args()

    try:
        catalogue = build_catalogue()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        catalogue_json = json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n"
        catalogue_script = (
            "window.LEARNZA_DBE_CATALOGUE = "
            + json.dumps(catalogue, ensure_ascii=False, separators=(",", ":"))
            + ";\n"
        )
        script_output = args.output.with_suffix(".js")
        temporary_outputs = (
            (args.output, catalogue_json),
            (script_output, catalogue_script),
        )
        for output_path, content in temporary_outputs:
            output_path.with_suffix(f"{output_path.suffix}.tmp").write_text(
                content,
                encoding="utf-8",
            )
        for output_path, _ in temporary_outputs:
            output_path.with_suffix(f"{output_path.suffix}.tmp").replace(output_path)
    except (OSError, URLError, ValueError) as error:
        print(f"DBE catalogue refresh failed: {error}", file=sys.stderr)
        return 1

    grades = sorted({item["grade"] for item in catalogue["resources"]})
    print(
        f"Wrote {len(catalogue['resources'])} resources for grades "
        f"{', '.join(map(str, grades))} to {args.output} and {script_output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

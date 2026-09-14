document.addEventListener("DOMContentLoaded", async () => {
  const rm = window.ResearchmapData;
  const root = document.getElementById("publication-list");
  const presentationTypeLabels = {
    oral_presentation: "口頭発表",
    poster_presentation: "ポスター発表",
    invited_oral_presentation: "招待講演",
    nominated_symposium: "指名シンポジウム",
    public_symposium: "公開シンポジウム",
  };

  function isMyName(name) {
    const normalized = name.trim().replace(/\s+/g, " ");
    return normalized.replaceAll(" ", "") === "吉丸直希" || normalized.toLowerCase() === "naoki yoshimaru";
  }

  function setContributors(element, value) {
    const names = rm.localizedArray(value).map((item) => item.name).filter(Boolean);
    names.forEach((name, index) => {
      if (index > 0) element.append(document.createTextNode(", "));
      const author = document.createElement("span");
      author.textContent = name;
      if (isMyName(name)) author.className = "my-name";
      element.append(author);
    });
  }

  function badge(text, kind = "") {
    const element = document.createElement("span");
    element.className = `badge ${kind}`.trim();
    element.textContent = text;
    return element;
  }

  function links(merge) {
    const container = document.createElement("span");
    container.className = "achievement-links";
    (merge.see_also || []).filter((item) => item["@id"]).forEach((item) => {
      const link = document.createElement("a");
      link.href = item["@id"];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.label === "doi" ? "DOI" : item.is_downloadable ? "PDF" : "URL";
      container.append(link);
    });
    return container;
  }

  function section(title, documents, renderer, qualifier = "") {
    if (!documents.length) return;
    const sectionElement = document.createElement("section");
    sectionElement.className = "achievement-section";
    const heading = document.createElement("h3");
    const headingTitle = document.createElement("span");
    headingTitle.textContent = title;
    heading.append(headingTitle);
    if (qualifier) {
      const headingQualifier = document.createElement("span");
      headingQualifier.className = "section-qualifier";
      headingQualifier.textContent = qualifier;
      heading.append(headingQualifier);
    }
    const list = document.createElement("ul");
    list.className = "achievement-list";
    documents.forEach((document) => list.append(renderer(document.merge)));
    sectionElement.append(heading, list);
    root.append(sectionElement);
  }

  function paperItem(merge) {
    const item = document.createElement("li");
    if (merge.major_achievement === true) item.classList.add("major-achievement");
    const title = document.createElement("strong");
    title.textContent = rm.localized(merge.paper_title);
    const authors = document.createElement("div");
    authors.className = "achievement-authors";
    setContributors(authors, merge.authors);
    const source = document.createElement("div");
    source.className = "achievement-source";
    const pages = (merge.starting_page || merge.ending_page)
      ? `pp.${merge.starting_page || ""}${merge.ending_page ? `–${merge.ending_page}` : ""}` : "";
    source.textContent = [rm.localized(merge.publication_name), merge.volume && `Vol.${merge.volume}`,
      merge.number && `No.${merge.number}`, pages, rm.dateLabel(merge.publication_date)].filter(Boolean).join(", ");
    const metadata = document.createElement("div");
    metadata.className = "achievement-metadata";
    const badges = document.createElement("div");
    badges.className = "badges";
    if (merge.invited === true) badges.append(badge("招待あり", "accent"));
    if (merge.major_achievement === true) badges.append(badge("主要論文", "major"));
    metadata.append(badges, links(merge));
    item.append(authors, title, source, metadata);
    return item;
  }

  function presentationItem(merge) {
    const item = document.createElement("li");
    if (merge.major_achievement === true) item.classList.add("major-achievement");
    const title = document.createElement("strong");
    title.textContent = rm.localized(merge.presentation_title);
    const presenters = document.createElement("div");
    presenters.className = "achievement-authors";
    setContributors(presenters, merge.presenters);
    const source = document.createElement("div");
    source.className = "achievement-source";
    source.textContent = [rm.localized(merge.event), rm.dateLabel(merge.publication_date)].filter(Boolean).join(", ");
    const badges = document.createElement("div");
    badges.className = "badges";
    if (merge.presentation_type) badges.append(badge(presentationTypeLabels[merge.presentation_type] || merge.presentation_type));
    if (merge.invited === true) badges.append(badge("招待あり", "accent"));
    if (merge.major_achievement === true) badges.append(badge("主要業績", "major"));
    item.append(presenters, title, source, badges, links(merge));
    return item;
  }

  function simpleItem(merge, titleField, detailFields, dateField) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = rm.localized(merge[titleField]);
    const detail = document.createElement("div");
    detail.className = "achievement-source";
    detail.textContent = [...detailFields.map((field) => rm.localized(merge[field])), rm.dateLabel(merge[dateField])].filter(Boolean).join(", ");
    item.append(title, detail, links(merge));
    return item;
  }

  try {
    const documents = await rm.load();
    root.replaceChildren();
    const papers = rm.sortNewest(rm.byType(documents, "published_papers"));
    const journals = papers.filter((item) => item.merge.published_paper_type === "scientific_journal");
    const internationalJournals = journals.filter((item) => (item.merge.languages || []).includes("eng"));
    const domesticJournals = journals.filter((item) => !(item.merge.languages || []).includes("eng"));
    const internationalConferences = papers.filter((item) => item.merge.published_paper_type === "international_conference_proceedings");
    const domesticConferences = papers.filter((item) => ![
      "scientific_journal", "international_conference_proceedings", "master_thesis", "doctoral_thesis",
    ].includes(item.merge.published_paper_type));
    const thesesAndOther = papers.filter((item) => ["master_thesis", "doctoral_thesis"].includes(item.merge.published_paper_type));

    section("国際雑誌論文", internationalJournals.filter((item) => item.merge.referee === true), paperItem, "査読あり");
    section("国際雑誌論文", internationalJournals.filter((item) => item.merge.referee !== true), paperItem, "査読なし");
    section("国内雑誌論文", domesticJournals.filter((item) => item.merge.referee === true), paperItem, "査読あり");
    section("国内雑誌論文", domesticJournals.filter((item) => item.merge.referee !== true), paperItem, "査読なし");
    section("国際会議論文", internationalConferences.filter((item) => item.merge.referee === true), paperItem, "査読あり");
    section("国際会議論文", internationalConferences.filter((item) => item.merge.referee !== true), paperItem, "査読なし");
    section("国内会議論文", domesticConferences.filter((item) => item.merge.referee === true), paperItem, "査読あり");
    section("国内会議論文", domesticConferences.filter((item) => item.merge.referee !== true), paperItem, "査読なし");
    section("学位論文・その他", thesesAndOther, paperItem);
    section("講演・口頭発表", rm.sortNewest(rm.byType(documents, "presentations")), presentationItem);
    section("受賞", rm.sortNewest(rm.byType(documents, "awards")), (document) => simpleItem(document, "award_name", ["award_title", "association"], "award_date"));
    section("Works", rm.sortNewest(rm.byType(documents, "works")), (document) => simpleItem(document, "work_title", ["location"], "publication_date"));
    section("社会貢献活動", rm.sortNewest(rm.byType(documents, "academic_contribution"), ["from_event_date"]),
      (document) => simpleItem(document, "academic_contribution_title", ["promoter", "location"], "from_event_date"));
  } catch (error) {
    root.replaceChildren();
    const message = document.createElement("p");
    message.className = "load-error";
    message.textContent = error.message;
    root.append(message);
  }
});

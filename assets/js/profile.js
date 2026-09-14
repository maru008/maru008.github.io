document.addEventListener("DOMContentLoaded", async () => {
  const rm = window.ResearchmapData;
  document.title = rm.t("Naoki Yoshimaru — Profile", "Naoki Yoshimaru — プロフィール");

  function appendList(id, items) {
    const list = document.getElementById(id);
    list.replaceChildren();
    items.filter(Boolean).forEach((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      list.append(item);
    });
  }

  function joinLocalizedParts(merge, names) {
    return names.map((name) => rm.localized(merge[name])).filter(Boolean).join(" ");
  }

  try {
    const documents = await rm.load();
    const researcher = rm.byType(documents, "researchers")[0]?.merge || {};
    appendList("affiliation-list", (researcher.affiliations || [])
      .filter((item) => item.display_affiliation !== "closed")
      .map((item) => joinLocalizedParts(item, ["affiliation", "section", "job"])));

    appendList("education-list", rm.sortNewest(rm.byType(documents, "education"), ["from_date"]).map(({ merge }) =>
      `${rm.period(merge.from_date, merge.to_date)}${rm.t(": ", "：")}${joinLocalizedParts(merge, ["affiliation", "department", "course"])}`));
    appendList("research-area-list", rm.byType(documents, "research_areas").map(({ merge }) =>
      [rm.localized(merge.research_field), rm.localized(merge.discipline), merge.item_number].filter(Boolean).join(" / ")));
    appendList("research-interest-list", rm.byType(documents, "research_interests").map(({ merge }) => rm.localized(merge.keyword)));
    appendList("career-list", rm.sortNewest(rm.byType(documents, "research_experience"), ["from_date"]).map(({ merge }) =>
      `${rm.period(merge.from_date, merge.to_date)}${rm.t(": ", "：")}${joinLocalizedParts(merge, ["affiliation", "section", "job"])}`));
    appendList("association-list", rm.sortNewest(rm.byType(documents, "association_memberships"), ["from_date"]).map(({ merge }) =>
      `${rm.period(merge.from_date, merge.to_date)}${rm.t(": ", "：")}${rm.localized(merge.academic_society_name)}`));
    appendList("committee-list", rm.sortNewest(rm.byType(documents, "committee_memberships"), ["from_date"]).map(({ merge }) =>
      `${rm.period(merge.from_date, merge.to_date)}${rm.t(": ", "：")}${[rm.localized(merge.association), rm.localized(merge.committee_name)].filter(Boolean).join(" ")}`));

    const links = document.getElementById("links-list");
    links.replaceChildren();
    const seen = new Set();
    const resources = [
      { label: "researchmap", url: `https://researchmap.jp/${researcher.permalink || "naokiyoshimaru"}` },
      ...(researcher.see_also || []).map((item) => ({ label: item.label || "関連リンク", url: item["@id"] })),
    ];
    resources.filter((item) => item.url && !seen.has(item.url) && seen.add(item.url)).forEach((item) => {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.label === "url" ? rm.t("Lab Profile", "研究室プロフィール") : item.label.toUpperCase();
      links.append(link);
    });
  } catch (error) {
    const message = document.createElement("p");
    message.className = "load-error";
    message.textContent = error.message;
    document.querySelector("main").prepend(message);
  }
});

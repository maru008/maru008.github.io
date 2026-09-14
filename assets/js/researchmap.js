(function (root) {
  "use strict";

  const dataUrl = "data/public/researchmap.json";

  async function load() {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error(`researchmapデータを読み込めませんでした (HTTP ${response.status})`);
    const documents = await response.json();
    if (!Array.isArray(documents)) throw new Error("公開用researchmapデータの形式が不正です。");
    return documents;
  }

  function localized(value, preferred = "ja") {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    const order = preferred === "en" ? ["en", "ja", "ja-Kana"] : ["ja", "en", "ja-Kana"];
    for (const language of order) {
      if (typeof value[language] === "string" && value[language].trim()) return value[language].trim();
    }
    return "";
  }

  function localizedArray(value, preferred = "ja") {
    if (!value || typeof value !== "object") return [];
    const items = value[preferred] || value[preferred === "ja" ? "en" : "ja"] || [];
    return Array.isArray(items) ? items : [];
  }

  function visible(document) {
    return document?.merge?.display !== "closed";
  }

  function byType(documents, type) {
    return documents.filter((document) => (document?.type || document?.insert?.type) === type && visible(document));
  }

  function dateLabel(value) {
    if (!value || value === "9999") return value === "9999" ? "現在" : "";
    const parts = String(value).split("-");
    if (parts.length === 1) return `${parts[0]}年`;
    if (parts.length === 2) return `${parts[0]}年${Number(parts[1])}月`;
    return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
  }

  function period(from, to) {
    const start = dateLabel(from);
    const end = dateLabel(to);
    if (!start) return end;
    if (!end) return start;
    return `${start}〜${end}`;
  }

  function sortNewest(documents, dateFields = ["publication_date", "award_date", "from_date", "from_event_date"]) {
    return [...documents].sort((left, right) => {
      const leftDate = dateFields.map((field) => left.merge[field]).find(Boolean) || "";
      const rightDate = dateFields.map((field) => right.merge[field]).find(Boolean) || "";
      return String(rightDate).localeCompare(String(leftDate));
    });
  }

  root.ResearchmapData = { byType, dateLabel, dataUrl, load, localized, localizedArray, period, sortNewest, visible };
})(window);

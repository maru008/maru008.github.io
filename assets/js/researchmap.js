(function (root) {
  "use strict";

  const dataUrl = "data/public/researchmap.json";
  const languageKey = "portfolio-language";
  const requestedLanguage = new URLSearchParams(window.location.search).get("lang");
  const storedLanguage = window.localStorage.getItem(languageKey);
  const language = ["en", "ja"].includes(requestedLanguage)
    ? requestedLanguage
    : (["en", "ja"].includes(storedLanguage) ? storedLanguage : "en");

  document.documentElement.lang = language;
  document.querySelectorAll("[data-en][data-ja]").forEach((element) => {
    element.textContent = element.dataset[language];
  });
  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
  document.querySelectorAll("[data-language]").forEach((button) => {
    const active = button.dataset.language === language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", () => {
      const nextLanguage = button.dataset.language;
      if (nextLanguage === language) return;
      window.localStorage.setItem(languageKey, nextLanguage);
      const url = new URL(window.location.href);
      url.searchParams.set("lang", nextLanguage);
      window.location.assign(url);
    });
  });
  document.querySelectorAll("nav a[href]").forEach((link) => {
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    url.searchParams.set("lang", language);
    link.href = url;
  });

  function t(english, japanese) {
    return language === "ja" ? japanese : english;
  }

  async function load() {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error(t(
      `Could not load researchmap data (HTTP ${response.status})`,
      `researchmapデータを読み込めませんでした (HTTP ${response.status})`,
    ));
    const documents = await response.json();
    if (!Array.isArray(documents)) throw new Error(t(
      "The public researchmap data has an invalid format.",
      "公開用researchmapデータの形式が不正です。",
    ));
    return documents;
  }

  function localized(value, preferred = language) {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    const order = preferred === "en" ? ["en", "ja", "ja-Kana"] : ["ja", "en", "ja-Kana"];
    for (const language of order) {
      if (typeof value[language] === "string" && value[language].trim()) return value[language].trim();
    }
    return "";
  }

  function localizedArray(value, preferred = language) {
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
    if (!value || value === "9999") return value === "9999" ? t("Present", "現在") : "";
    const parts = String(value).split("-");
    if (language === "ja") {
      if (parts.length === 1) return `${parts[0]}年`;
      if (parts.length === 2) return `${parts[0]}年${Number(parts[1])}月`;
      return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
    }
    if (parts.length === 1) return parts[0];
    const month = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" })
      .format(new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, 1)));
    if (parts.length === 2) return `${month} ${parts[0]}`;
    return `${month} ${Number(parts[2])}, ${parts[0]}`;
  }

  function isFutureDate(value, today = new Date()) {
    if (!value || value === "9999") return false;
    const match = String(value).match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
    if (!match) return false;
    const dateNumber = Number(match[1]) * 10000 + Number(match[2] || 1) * 100 + Number(match[3] || 1);
    const todayNumber = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    return dateNumber > todayNumber;
  }

  function period(from, to) {
    const start = dateLabel(from);
    const end = dateLabel(to);
    if (!start) return end;
    if (!end) return start;
    return `${start}${t("–", "〜")}${end}`;
  }

  function sortNewest(documents, dateFields = ["publication_date", "award_date", "from_date", "from_event_date"]) {
    return [...documents].sort((left, right) => {
      const leftDate = dateFields.map((field) => left.merge[field]).find(Boolean) || "";
      const rightDate = dateFields.map((field) => right.merge[field]).find(Boolean) || "";
      return String(rightDate).localeCompare(String(leftDate));
    });
  }

  root.ResearchmapData = { byType, dateLabel, dataUrl, isFutureDate, language, load, localized, localizedArray, period, sortNewest, t, visible };
})(window);

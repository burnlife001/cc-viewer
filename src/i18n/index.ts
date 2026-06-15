import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import zh from "./locales/zh.json";

const getInitialLanguage = (): string => {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem("language");
      if (stored === "zh" || stored === "en") {
        return stored;
      }
    } catch {
      // ignore
    }
  }

  const navLang = typeof navigator !== "undefined"
    ? navigator.language?.toLowerCase()
    : undefined;

  if (navLang?.startsWith("zh")) return "zh";
  return "en";
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;

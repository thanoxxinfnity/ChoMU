import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getLanguage, setLanguage as persistLanguage, type Language } from './storage'

const STRINGS = {
  en: {
    'nav.generate': 'Create',
    'nav.history': 'Gallery',
    'nav.settings': 'Settings',
    'sidebar.tagline': 'AI 3D Generator',
    'sidebar.poweredBy': 'Powered by NVIDIA NIM',
    'sidebar.trellis': 'Microsoft TRELLIS',

    'generate.title': 'Generate a 3D model',
    'generate.subtitle': 'Real-time generation via NVIDIA NIM — Microsoft TRELLIS.',
    'generate.tab.text': 'Text to 3D',
    'generate.tab.image': 'Image to 3D',
    'generate.tab.flux': 'Text to Image',
    'generate.prompt.placeholder': 'A weathered leather backpack with brass buckles, photorealistic…',
    'generate.flux.placeholder': 'A neon-lit cyberpunk street market at night, ultra detailed…',
    'generate.flux.hint': 'Free FLUX image generation via Pollinations — no API key needed. Generate an image, then turn it into a 3D model.',
    'generate.flux.generate': 'Generate image',
    'generate.image.pick': 'Click to upload an image',
    'generate.image.formats': 'PNG, JPG, or WebP',
    'generate.image.limitation':
      "NVIDIA's hosted endpoint currently rejects custom image uploads server-side. See Settings for details.",
    'generate.now': 'Generate now',
    'generate.generating': 'Generating…',
    'generate.warmingUp': 'Waking up NVIDIA GPU worker (~90s)…',
    'generate.seed': 'Seed',
    'generate.export': 'Export',
    'generate.noApiKey': 'No NVIDIA API key set yet. Add one in Settings before generating.',
    'generate.openSettings': 'Open Settings',
    'generate.waiting': 'Waiting for a model…',
    'generate.reliabilityNote':
      "NVIDIA's servers can occasionally be busy or slow, which can show up as an error — ChoMU automatically retries a few times before giving up. Every model that finishes successfully is real, and downloadable in all supported formats (GLB, glTF, OBJ, STL, PLY, USDZ).",

    'history.title': 'Gallery',
    'history.subtitle': "Every generation you've run, stored locally on this device.",
    'history.empty': 'No generations yet.',
    'history.generateFirst': 'Create your first model',
    'history.delete': 'Delete',
    'history.pending': 'Pending',
    'history.failed': 'Failed',

    'settings.title': 'Settings',
    'settings.subtitle': 'Manage your NVIDIA API key and app preferences.',
    'settings.apiKey.title': 'NVIDIA NIM API Key',
    'settings.apiKey.description':
      "ChoMU calls NVIDIA's hosted microsoft/trellis NIM endpoint directly with this key. It is stored only on this device and is never bundled into the app or sent anywhere except NVIDIA's API. Get a free key at build.nvidia.com.",
    'settings.apiKey.save': 'Save key',
    'settings.apiKey.saved': 'Saved ✓',
    'settings.apiKey.test': 'Test API key',
    'settings.apiKey.clear': 'Clear',
    'settings.falKey.title': 'fal.ai API Key (optional)',
    'settings.falKey.description':
      "For real photo image-to-3D — unlike NVIDIA's free preview, fal.ai's hosted TRELLIS genuinely accepts your own uploaded photos. It's a separate, paid pay-per-use service with its own key (get one at fal.ai). When set, Image-to-3D uses fal.ai automatically; when empty, it falls back to NVIDIA (which only accepts its own preset images).",
    'settings.appearance': 'Appearance',
    'settings.language': 'Language',
    'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark',
    'settings.theme.system': 'System',
    'settings.knownLimitation.title': 'Known NVIDIA-side limitation:',
    'settings.knownLimitation.body':
      'as of now, NVIDIA\'s hosted TRELLIS endpoint only accepts its own preset gallery images for Image-to-3D — custom image uploads are rejected server-side (Expected: example_id, got: asset_id). Text-to-3D is fully working. ChoMU will surface this exact error if it happens, and will start working automatically the moment NVIDIA lifts the restriction — no app update needed. In the meantime, add a fal.ai API key above to use real photo uploads for Image-to-3D right now.',
  },
  hi: {
    'nav.generate': 'क्रिएट',
    'nav.history': 'गैलरी',
    'nav.settings': 'सेटिंग्स',
    'sidebar.tagline': 'AI 3D जनरेटर',
    'sidebar.poweredBy': 'NVIDIA NIM द्वारा संचालित',
    'sidebar.trellis': 'Microsoft TRELLIS',

    'generate.title': '3D मॉडल जनरेट करें',
    'generate.subtitle': 'NVIDIA NIM — Microsoft TRELLIS से रियल-टाइम जनरेशन।',
    'generate.tab.text': 'टेक्स्ट से 3D',
    'generate.tab.image': 'इमेज से 3D',
    'generate.tab.flux': 'टेक्स्ट से इमेज',
    'generate.prompt.placeholder': 'पीतल की बकल वाला पुराना चमड़े का बैग, फोटोरियलिस्टिक…',
    'generate.flux.placeholder': 'रात में नियॉन-लिट साइबरपंक स्ट्रीट मार्केट, अल्ट्रा डिटेल्ड…',
    'generate.flux.hint': 'Pollinations के जरिए फ्री FLUX इमेज जनरेशन — कोई API key नहीं चाहिए। इमेज जनरेट करें, फिर उसे 3D मॉडल में बदलें।',
    'generate.flux.generate': 'इमेज जनरेट करें',
    'generate.image.pick': 'इमेज अपलोड करने के लिए टैप करें',
    'generate.image.formats': 'PNG, JPG, या WebP',
    'generate.image.limitation':
      'NVIDIA का hosted endpoint अभी custom image uploads को server-side reject कर रहा है। पूरी जानकारी के लिए सेटिंग्स देखें।',
    'generate.now': 'अभी जनरेट करें',
    'generate.generating': 'जनरेट हो रहा है…',
    'generate.warmingUp': 'NVIDIA GPU worker जग रहा है (~90 सेकंड)…',
    'generate.seed': 'सीड',
    'generate.export': 'एक्सपोर्ट',
    'generate.noApiKey': 'अभी तक कोई NVIDIA API key सेट नहीं है। जनरेट करने से पहले सेटिंग्स में एक जोड़ें।',
    'generate.openSettings': 'सेटिंग्स खोलें',
    'generate.waiting': 'मॉडल का इंतज़ार हो रहा है…',
    'generate.reliabilityNote':
      'कभी-कभी NVIDIA का सर्वर busy या धीमा हो सकता है, जिससे error आ सकता है — ChoMU automatically कुछ बार retry करता है हार मानने से पहले। जो भी model successfully बनता है वो 100% real होता है, और सभी supported formats (GLB, glTF, OBJ, STL, PLY, USDZ) में download हो सकता है।',

    'history.title': 'गैलरी',
    'history.subtitle': 'आपके सभी जनरेशन, इस डिवाइस पर लोकल रूप से सेव।',
    'history.empty': 'अभी तक कोई जनरेशन नहीं है।',
    'history.generateFirst': 'अपना पहला मॉडल बनाएं',
    'history.delete': 'डिलीट',
    'history.pending': 'पेंडिंग',
    'history.failed': 'फेल',

    'settings.title': 'सेटिंग्स',
    'settings.subtitle': 'अपनी NVIDIA API key और ऐप प्रेफरेंस मैनेज करें।',
    'settings.apiKey.title': 'NVIDIA NIM API Key',
    'settings.apiKey.description':
      'ChoMU इस key से सीधे NVIDIA के hosted microsoft/trellis NIM endpoint को कॉल करता है। ये सिर्फ इसी डिवाइस पर स्टोर होती है, कभी भी ऐप में bundle नहीं होती या NVIDIA के API के अलावा कहीं और नहीं भेजी जाती। free key build.nvidia.com पर मिलेगी।',
    'settings.apiKey.save': 'Key सेव करें',
    'settings.apiKey.saved': 'सेव हो गया ✓',
    'settings.apiKey.test': 'API key टेस्ट करें',
    'settings.apiKey.clear': 'हटाएं',
    'settings.falKey.title': 'fal.ai API Key (वैकल्पिक)',
    'settings.falKey.description':
      'असली फोटो से image-to-3D के लिए — NVIDIA के free preview के उलट, fal.ai का hosted TRELLIS आपकी खुद अपलोड की गई फोटो सच में accept करता है। ये अलग, paid pay-per-use service है, अपनी खुद की key के साथ (fal.ai पर मिलेगी)। Key set होने पर Image-to-3D अपने आप fal.ai इस्तेमाल करेगा; empty होने पर NVIDIA पर वापस चला जाएगा (जो सिर्फ अपनी preset images accept करता है)।',
    'settings.appearance': 'दिखावट',
    'settings.language': 'भाषा',
    'settings.theme.light': 'लाइट',
    'settings.theme.dark': 'डार्क',
    'settings.theme.system': 'सिस्टम',
    'settings.knownLimitation.title': 'NVIDIA की तरफ से जानी हुई सीमा:',
    'settings.knownLimitation.body':
      'अभी NVIDIA का hosted TRELLIS endpoint Image-to-3D के लिए सिर्फ अपनी preset gallery images ही accept करता है — custom image uploads server-side reject हो जाते हैं (Expected: example_id, got: asset_id)। Text-to-3D पूरी तरह काम कर रहा है। ChoMU यही exact error दिखाएगा अगर ऐसा हो, और जैसे ही NVIDIA ये restriction हटाएगा, बिना किसी app update के अपने आप काम करने लगेगा। तब तक, ऊपर fal.ai API key डालकर अभी असली फोटो से Image-to-3D इस्तेमाल कर सकते हो।',
  },
} as const

export type TranslationKey = keyof (typeof STRINGS)['en']

interface I18nContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    getLanguage().then(setLanguageState)
  }, [])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    persistLanguage(lang)
  }

  const t = (key: TranslationKey): string => STRINGS[language][key] ?? STRINGS.en[key] ?? key

  return <I18nContext.Provider value={{ language, setLanguage, t }}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

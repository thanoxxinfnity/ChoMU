import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getLanguage, setLanguage as persistLanguage, type Language } from './storage'

const STRINGS = {
  en: {
    'nav.generate': 'Generate',
    'nav.history': 'History',
    'nav.settings': 'Settings',
    'sidebar.tagline': 'AI 3D Generator',
    'sidebar.poweredBy': 'Powered by NVIDIA NIM',
    'sidebar.trellis': 'Microsoft TRELLIS',

    'generate.title': 'Generate a 3D model',
    'generate.subtitle': 'Real-time generation via NVIDIA NIM — Microsoft TRELLIS.',
    'generate.tab.text': 'Text to 3D',
    'generate.tab.image': 'Image to 3D',
    'generate.prompt.placeholder': 'A weathered leather backpack with brass buckles, photorealistic…',
    'generate.batchMode': 'Batch mode — queue multiple prompts at once',
    'generate.batchPlaceholder': 'One prompt per line — each line becomes a separate queued generation…',
    'generate.queued': 'queued',
    'generate.image.pick': 'Click to upload an image',
    'generate.image.formats': 'PNG, JPG, or WebP',
    'generate.image.limitation':
      "NVIDIA's hosted endpoint currently rejects custom image uploads server-side. See Settings for details.",
    'generate.advanced': 'Advanced parameters',
    'generate.now': 'Generate now',
    'generate.generating': 'Generating…',
    'generate.warmingUp': 'Waking up NVIDIA GPU worker (~90s)…',
    'generate.addToQueue': 'Add to queue',
    'generate.queueN': 'Queue',
    'generate.prompts': 'prompt',
    'generate.seed': 'Seed',
    'generate.export': 'Export',
    'generate.noApiKey': 'No NVIDIA API key set yet. Add one in Settings before generating.',
    'generate.openSettings': 'Open Settings',
    'generate.sample.label': 'Sample preset (NVIDIA example_id 0)',
    'generate.sample.button': 'Try a sample',
    'generate.sample.hint':
      "Uses NVIDIA's own bundled preset image, not your prompt — a quick way to see the viewer/exporter work. Not immune to NVIDIA's outages either.",
    'generate.waiting': 'Waiting for a model…',

    'history.title': 'Generation history',
    'history.subtitle': "Every generation you've run, stored locally on this device.",
    'history.empty': 'No generations yet.',
    'history.generateFirst': 'Generate your first model',
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
    'settings.appearance': 'Appearance',
    'settings.language': 'Language',
    'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark',
    'settings.theme.system': 'System',
    'settings.knownLimitation.title': 'Known NVIDIA-side limitation:',
    'settings.knownLimitation.body':
      'as of now, NVIDIA\'s hosted TRELLIS endpoint only accepts its own preset gallery images for Image-to-3D — custom image uploads are rejected server-side (Expected: example_id, got: asset_id). Text-to-3D is fully working. ChoMU will surface this exact error if it happens, and will start working automatically the moment NVIDIA lifts the restriction — no app update needed.',
  },
  hi: {
    'nav.generate': 'जनरेट',
    'nav.history': 'हिस्ट्री',
    'nav.settings': 'सेटिंग्स',
    'sidebar.tagline': 'AI 3D जनरेटर',
    'sidebar.poweredBy': 'NVIDIA NIM द्वारा संचालित',
    'sidebar.trellis': 'Microsoft TRELLIS',

    'generate.title': '3D मॉडल जनरेट करें',
    'generate.subtitle': 'NVIDIA NIM — Microsoft TRELLIS से रियल-टाइम जनरेशन।',
    'generate.tab.text': 'टेक्स्ट से 3D',
    'generate.tab.image': 'इमेज से 3D',
    'generate.prompt.placeholder': 'पीतल की बकल वाला पुराना चमड़े का बैग, फोटोरियलिस्टिक…',
    'generate.batchMode': 'बैच मोड — एक साथ कई प्रॉम्प्ट क्यू करें',
    'generate.batchPlaceholder': 'हर लाइन में एक प्रॉम्प्ट — हर लाइन अलग जनरेशन के रूप में क्यू होगी…',
    'generate.queued': 'क्यू में',
    'generate.image.pick': 'इमेज अपलोड करने के लिए टैप करें',
    'generate.image.formats': 'PNG, JPG, या WebP',
    'generate.image.limitation':
      'NVIDIA का hosted endpoint अभी custom image uploads को server-side reject कर रहा है। पूरी जानकारी के लिए सेटिंग्स देखें।',
    'generate.advanced': 'एडवांस्ड पैरामीटर्स',
    'generate.now': 'अभी जनरेट करें',
    'generate.generating': 'जनरेट हो रहा है…',
    'generate.warmingUp': 'NVIDIA GPU worker जग रहा है (~90 सेकंड)…',
    'generate.addToQueue': 'क्यू में जोड़ें',
    'generate.queueN': 'क्यू करें',
    'generate.prompts': 'प्रॉम्प्ट',
    'generate.seed': 'सीड',
    'generate.export': 'एक्सपोर्ट',
    'generate.noApiKey': 'अभी तक कोई NVIDIA API key सेट नहीं है। जनरेट करने से पहले सेटिंग्स में एक जोड़ें।',
    'generate.openSettings': 'सेटिंग्स खोलें',
    'generate.waiting': 'मॉडल का इंतज़ार हो रहा है…',
    'generate.sample.label': 'सैंपल प्रीसेट (NVIDIA example_id 0)',
    'generate.sample.button': 'सैंपल ट्राई करें',
    'generate.sample.hint':
      'ये NVIDIA की अपनी बंडल्ड preset image इस्तेमाल करता है, आपका प्रॉम्प्ट नहीं — viewer/exporter जल्दी देखने का तरीका। NVIDIA के outage से ये भी अछूता नहीं है।',

    'history.title': 'जनरेशन हिस्ट्री',
    'history.subtitle': 'आपके सभी जनरेशन, इस डिवाइस पर लोकल रूप से सेव।',
    'history.empty': 'अभी तक कोई जनरेशन नहीं है।',
    'history.generateFirst': 'अपना पहला मॉडल जनरेट करें',
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
    'settings.appearance': 'दिखावट',
    'settings.language': 'भाषा',
    'settings.theme.light': 'लाइट',
    'settings.theme.dark': 'डार्क',
    'settings.theme.system': 'सिस्टम',
    'settings.knownLimitation.title': 'NVIDIA की तरफ से जानी हुई सीमा:',
    'settings.knownLimitation.body':
      'अभी NVIDIA का hosted TRELLIS endpoint Image-to-3D के लिए सिर्फ अपनी preset gallery images ही accept करता है — custom image uploads server-side reject हो जाते हैं (Expected: example_id, got: asset_id)। Text-to-3D पूरी तरह काम कर रहा है। ChoMU यही exact error दिखाएगा अगर ऐसा हो, और जैसे ही NVIDIA ये restriction हटाएगा, बिना किसी app update के अपने आप काम करने लगेगा।',
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

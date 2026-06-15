// Curated, conservative autocomplete prompts for the patient profile form.
//
// These lists are deliberately short and exist only to make a blank form less
// intimidating for patients and families. They are NOT a complete or
// authoritative reference, and they are NOT medical advice. Free text is always
// accepted — the inputs use native <datalist>, which only suggests and never
// restricts what the user can type. When in doubt, the safest entry is the exact
// wording from the care team's report.

// Common cancer types, written the way a patient or family member is most likely
// to say them rather than in strict clinical nomenclature.
export const CANCER_TYPE_SUGGESTIONS: string[] = [
  'non-small cell lung cancer',
  'small cell lung cancer',
  'breast cancer',
  'colorectal cancer',
  'colon cancer',
  'rectal cancer',
  'pancreatic cancer',
  'prostate cancer',
  'ovarian cancer',
  'endometrial cancer',
  'cervical cancer',
  'bladder cancer',
  'kidney cancer',
  'liver cancer',
  'stomach cancer',
  'esophageal cancer',
  'melanoma',
  'glioblastoma',
  'multiple myeloma',
  'non-Hodgkin lymphoma',
  'Hodgkin lymphoma',
  'leukemia',
  'head and neck cancer',
  'thyroid cancer',
  'sarcoma'
];

// Common biomarkers and mutations that appear on pathology, genetic, or
// molecular test reports.
export const BIOMARKER_SUGGESTIONS: string[] = [
  'EGFR',
  'KRAS',
  'NRAS',
  'ALK',
  'ROS1',
  'BRAF',
  'HER2',
  'MET',
  'RET',
  'NTRK',
  'PD-L1',
  'MSI-High',
  'MMR deficient (dMMR)',
  'TMB-High',
  'BRCA1',
  'BRCA2',
  'PIK3CA',
  'ER (estrogen receptor)',
  'PR (progesterone receptor)',
  'TP53',
  'IDH1',
  'IDH2',
  'FGFR'
];

// Common oncology treatments and treatment categories, drug names lowercased to
// match how they usually appear.
export const THERAPY_SUGGESTIONS: string[] = [
  'chemotherapy',
  'immunotherapy',
  'targeted therapy',
  'radiation',
  'hormone therapy',
  'surgery',
  'carboplatin',
  'cisplatin',
  'paclitaxel',
  'docetaxel',
  'pemetrexed',
  'gemcitabine',
  '5-fluorouracil (5-FU)',
  'capecitabine',
  'oxaliplatin',
  'irinotecan',
  'pembrolizumab',
  'nivolumab',
  'atezolizumab',
  'durvalumab',
  'osimertinib',
  'erlotinib',
  'trastuzumab',
  'bevacizumab',
  'olaparib'
];

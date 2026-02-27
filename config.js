// Supabase Configuration
const SUPABASE_URL = 'https://qnscnhccaedrwwmjxhuc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_uKmMzyUx5EkAs8GmETBTgw_e2WsKTNn';

// Status Options
const STATUS = {
  NOT_VISITED: 'not_visited',
  FOLLOW_UP: 'follow_up',
  DEMO_BOOKED: 'demo_booked',
  DQ: 'dq'
};

const STATUS_LABELS = {
  [STATUS.NOT_VISITED]: 'Not Visited',
  [STATUS.FOLLOW_UP]: 'Follow Up',
  [STATUS.DEMO_BOOKED]: 'Demo Booked',
  [STATUS.DQ]: 'DQ'
};

// Form Options
const ORDER_OPTIONS = ['N/A', '0 - 500', '500 - 1,000', '1,000 - 10,000', '10,000+'];
const AOV_OPTIONS = ['N/A', '< $100', '$100 - $200', '$200 - $300', '$300 - $400', '$400 - $500', '$500+'];
const REVENUE_THRESHOLDS = [0, 50000, 100000, 200000, 300000, 500000, 1000000];

// Platform Options
const PLATFORMS = [
  'BigCommerce',
  'CommerceTools',
  'Custom Cart',
  'Magento (Adobe Commerce)',
  'NetSuite SuiteCommerce',
  'Salesforce Commerce Cloud',
  'SAP Hybris',
  'Shopify',
  'Shopify Headless',
  'Shopify Plus',
  'Shopware',
  'VTEX',
  'WooCommerce',
  '[No Platform]'
];

// Protection Options
const PROTECTION_PROVIDERS = [
  'Bolt Protect',
  'Corso',
  'Cover Genius',
  'Clyde',
  'DIY',
  'Extend',
  'Navidium',
  'Onward',
  'OrderProtection',
  'Protecht',
  'Redo',
  'Route',
  'SavedBy',
  'Seel',
  'SipTection',
  'Swap',
  'XCover',
  '[No Protection]'
];

// Returns Options
const RETURNS_PROVIDERS = [
  'AfterShip',
  'Clicksit',
  'Corso',
  'Frate (Route)',
  'Happy Returns',
  'In-House',
  'Loop',
  'Narvar',
  'Optoro',
  'ParcelLab',
  'Redo',
  'ReturnLogic',
  'ReturnsGo',
  'ReverseLogix',
  'Reversely',
  'Rich Returns',
  'Sorted',
  'Swap',
  'ZigZag Global',
  '[No Returns]'
];

// Default Shows
const DEFAULT_SHOWS = [
  { id: 'whce2026', name: 'Western Hunting Expo', location: 'SLC', startDate: '2026-02-12', endDate: '2026-02-15', website: 'https://huntexpo.com/', exhibitorList: 'https://whce2026.smallworldlabs.com/exhibitors' },
  { id: 'expowest2026', name: 'Expo West', location: 'Anaheim', startDate: '2026-03-03', endDate: '2026-03-06', website: 'https://www.expowest.com/en/home.html', exhibitorList: 'https://www.expowest.com/en/exhibitor-list/2026-exhibitor-list.html' },
  { id: 'bewell2026', name: 'Be Well', location: 'NY', startDate: '2026-03-08', endDate: '2026-03-10', website: 'https://www.bewellshownewyork.com/', exhibitorList: 'https://iecscibsny2026.smallworldlabs.com/exhibitors' },
  { id: 'asd2026', name: 'ASD', location: 'Las Vegas', startDate: '2026-03-17', endDate: '2026-03-19', website: 'https://asdonline.com/', exhibitorList: 'https://march2026.smallworldlabs.com/exhibitors' },
  { id: 'globalpet2026', name: 'Global Pet Expo', location: 'Orlando', startDate: '2026-03-25', endDate: '2026-03-27', website: 'https://globalpetexpo.org/', exhibitorList: 'https://globalpetexpo26.mapyourshow.com/8_0/explore/exhibitor-gallery.cfm' },
  { id: 'tpe2026', name: 'TPE', location: 'Las Vegas', startDate: '2026-03-31', endDate: '2026-04-01', website: 'https://totalproductexpo.com/', exhibitorList: 'https://tpe2026.smallworldlabs.com/exhibitors' }
];

// Default Reps
const DEFAULT_REPS = [
  { id: 'drew', name: 'Drew' },
  { id: 'jason', name: 'Jason' },
  { id: 'wyatt', name: 'Wyatt' }
];

// List Types
const LIST_TYPES = {
  HIT_LIST: 'hit_list',
  MASTER: 'master',
  CUSTOMERS: 'customers',
  CURRENT_OPPS: 'current_opps'
};

const LIST_LABELS = {
  [LIST_TYPES.HIT_LIST]: 'Hit List',
  [LIST_TYPES.MASTER]: 'Master',
  [LIST_TYPES.CUSTOMERS]: 'Customers',
  [LIST_TYPES.CURRENT_OPPS]: 'Current Opps'
};

// Required fields for import mapping
const REQUIRED_FIELDS = [
  { key: 'companyName', label: 'Company Name', required: true },
  { key: 'boothNumber', label: 'Booth Number', required: false },
  { key: 'domain', label: 'Domain', required: false },
  { key: 'estimatedMonthlySales', label: 'Est. Monthly Sales', required: false },
  { key: 'platform', label: 'Platform', required: false },
  { key: 'protection', label: 'Protection', required: false },
  { key: 'returns', label: 'Returns', required: false }
];

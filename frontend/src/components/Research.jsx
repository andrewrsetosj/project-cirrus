import { useState, useEffect, useRef } from 'react'
import Markdown from 'react-markdown'

// ── Stock name lookup ─────────────────────────────────────────────────────────
const N = {
  // Mega Cap / FAANG+
  AAPL:'Apple', MSFT:'Microsoft', NVDA:'Nvidia', GOOGL:'Alphabet', META:'Meta Platforms',
  AMZN:'Amazon', TSLA:'Tesla', ORCL:'Oracle', NFLX:'Netflix', ADBE:'Adobe', IBM:'IBM',
  // AI & ML
  PLTR:'Palantir', APP:'AppLovin', SMCI:'SuperMicro', AI:'C3.ai', SOUN:'SoundHound AI',
  BBAI:'BigBear.ai', IONQ:'IonQ', DELL:'Dell', HPE:'Hewlett Packard Ent.', MRVL:'Marvell',
  // Semiconductors
  TSM:'TSMC', AMD:'AMD', INTC:'Intel', AVGO:'Broadcom', QCOM:'Qualcomm',
  MU:'Micron', AMAT:'Applied Materials', LRCX:'Lam Research', ASML:'ASML', TXN:'Texas Instruments',
  MCHP:'Microchip Technology', ON:'ON Semiconductor', SWKS:'Skyworks Solutions', QRVO:'Qorvo',
  MPWR:'Monolithic Power', ADI:'Analog Devices', CRUS:'Cirrus Logic', WOLF:'Wolfspeed',
  // Cybersecurity
  CRWD:'CrowdStrike', PANW:'Palo Alto Networks', FTNT:'Fortinet', ZS:'Zscaler',
  NET:'Cloudflare', OKTA:'Okta', S:'SentinelOne', TENB:'Tenable', VRNS:'Varonis',
  CHKP:'Check Point Software', QLYS:'Qualys', RPD:'Rapid7', GEN:'Gen Digital', BB:'BlackBerry',
  // Cloud & SaaS
  CRM:'Salesforce', NOW:'ServiceNow', SNOW:'Snowflake', DDOG:'Datadog',
  MDB:'MongoDB', HUBS:'HubSpot', WDAY:'Workday', GTLB:'GitLab', TWLO:'Twilio', ESTC:'Elastic',
  // Software & Dev Tools
  CSCO:'Cisco', CDNS:'Cadence Design', SNPS:'Synopsys', ADSK:'Autodesk', PTC:'PTC Inc',
  ZM:'Zoom', TEAM:'Atlassian', DOCU:'DocuSign', PCTY:'Paylocity', PAYC:'Paycom',
  MANH:'Manhattan Associates', VEEV:'Veeva Systems',
  // Enterprise Tech & IT Services
  ACN:'Accenture', CTSH:'Cognizant', EPAM:'EPAM Systems', IT:'Gartner', INFY:'Infosys',
  HPQ:'HP Inc', NTAP:'NetApp', STX:'Seagate', WDC:'Western Digital',
  FFIV:'F5 Networks', G:'Genpact',
  // Social Media & Global Internet
  SNAP:'Snap', PINS:'Pinterest', RDDT:'Reddit', MTCH:'Match Group',
  BABA:'Alibaba', JD:'JD.com', BIDU:'Baidu', PDD:'PDD Holdings', MELI:'MercadoLibre', SE:'Sea Limited',
  // Beverages
  KO:'Coca-Cola', PEP:'PepsiCo', MNST:'Monster Beverage', COKE:'Coca-Cola Consol.',
  STZ:'Constellation Brands', BUD:'AB InBev', TAP:'Molson Coors', SAM:'Boston Beer',
  CELH:'Celsius Holdings', ABEV:'Ambev', FIZZ:'National Beverage (LaCroix)',
  // Consumer Staples & Big-Box
  COST:'Costco', WMT:'Walmart', TGT:'Target', HD:'Home Depot',
  LOW:"Lowe's", TJX:'TJX Companies', DLTR:'Dollar Tree', DG:'Dollar General',
  KR:'Kroger', CLX:'Clorox', SYY:'Sysco', PG:'Procter & Gamble', CL:'Colgate-Palmolive',
  KMB:'Kimberly-Clark', CHD:'Church & Dwight', EL:'Estée Lauder', BBWI:'Bath & Body Works', NWL:'Newell Brands', SHW:'Sherwin-Williams',
  // Consumer Retail & Apparel
  NKE:'Nike', LULU:'Lululemon', RL:'Ralph Lauren', BBY:'Best Buy', ULTA:'Ulta Beauty',
  DKS:"Dick's Sporting Goods", AZO:'AutoZone', ORLY:"O'Reilly Auto Parts",
  KMX:'CarMax', TSCO:'Tractor Supply', WSM:'Williams-Sonoma', RH:'RH', AN:'AutoNation',
  // Healthcare & Pharma
  LLY:'Eli Lilly', UNH:'UnitedHealth', JNJ:'Johnson & Johnson', ABBV:'AbbVie',
  MRK:'Merck', PFE:'Pfizer', AMGN:'Amgen', BMY:'Bristol-Myers', GILD:'Gilead',
  REGN:'Regeneron', NVO:'Novo Nordisk', CVS:'CVS Health',
  HUM:'Humana', CI:'Cigna', ELV:'Elevance Health', CNC:'Centene', MCK:'McKesson', CAH:'Cardinal Health',
  // Biotech
  MRNA:'Moderna', BIIB:'Biogen', VRTX:'Vertex Pharmaceuticals', ILMN:'Illumina',
  ARWR:'Arrowhead Pharma', RXRX:'Recursion Pharma', NTLA:'Intellia Therapeutics',
  EDIT:'Editas Medicine', CRSP:'CRISPR Therapeutics', DNLI:'Denali Therapeutics',
  ALNY:'Alnylam Pharmaceuticals', BMRN:'BioMarin', INCY:'Incyte', EXEL:'Exelixis', PTCT:'PTC Therapeutics',
  // Medical Devices
  DHR:'Danaher', TMO:'Thermo Fisher', ABT:'Abbott Laboratories', MDT:'Medtronic', SYK:'Stryker',
  BSX:'Boston Scientific', ISRG:'Intuitive Surgical', EW:'Edwards Lifesciences', BDX:'Becton Dickinson',
  ZBH:'Zimmer Biomet', DXCM:'Dexcom', PODD:'Insulet', ALGN:'Align Technology', WAT:'Waters Corp',
  IDXX:'IDEXX Laboratories', RMD:'ResMed',
  // Financial Services
  JPM:'JPMorgan Chase', BAC:'Bank of America', GS:'Goldman Sachs', MS:'Morgan Stanley',
  V:'Visa', MA:'Mastercard', AXP:'American Express', 'BRK-B':'Berkshire Hathaway',
  WFC:'Wells Fargo', C:'Citigroup', COF:'Capital One', BX:'Blackstone', SCHW:'Charles Schwab',
  ICE:'Intercontinental Exchange', CME:'CME Group',
  // Asset Management
  BLK:'BlackRock', APO:'Apollo Global', KKR:'KKR & Co', CG:'Carlyle Group', BAM:'Brookfield Asset',
  TPG:'TPG Inc', ARES:'Ares Management', STT:'State Street', NTRS:'Northern Trust',
  IVZ:'Invesco', BEN:'Franklin Templeton', AMG:'Affiliated Managers',
  // Insurance
  PGR:'Progressive', ALL:'Allstate', TRV:'Travelers', CB:'Chubb', MET:'MetLife',
  PRU:'Prudential Financial', AFL:'Aflac', HIG:'Hartford Financial', AIG:'AIG',
  AJG:'Arthur J. Gallagher', MRSH:'Marsh McLennan', GL:'Globe Life', UNM:'Unum Group',
  EG:'Everest Group', WRB:'W.R. Berkley',
  // Regional Banks
  USB:'U.S. Bancorp', PNC:'PNC Financial', TFC:'Truist Financial', RF:'Regions Financial',
  HBAN:'Huntington Bancshares', KEY:'KeyCorp', CFG:'Citizens Financial', FITB:'Fifth Third',
  MTB:'M&T Bank', ZION:'Zions Bancorp', WAL:'Western Alliance',
  // FinTech & Crypto
  XYZ:'Block', PYPL:'PayPal', COIN:'Coinbase', SOFI:'SoFi Technologies',
  AFRM:'Affirm', HOOD:'Robinhood', NU:'Nu Holdings', INTU:'Intuit', FISV:'Fiserv',
  GPN:'Global Payments', FIS:'FIS', JKHY:'Jack Henry', BR:'Broadridge',
  TOST:'Toast', BILL:'BILL Holdings', WEX:'WEX Inc', FOUR:'Shift4 Payments', RELY:'Remitly',
  MSTR:'MicroStrategy', RIOT:'Riot Platforms', MARA:'Marathon Digital',
  // Energy
  XOM:'ExxonMobil', CVX:'Chevron', COP:'ConocoPhillips', OXY:'Occidental',
  SLB:'Schlumberger', PSX:'Phillips 66', MPC:'Marathon Petroleum',
  EOG:'EOG Resources', HAL:'Halliburton', KMI:'Kinder Morgan', WMB:'Williams Companies',
  DVN:'Devon Energy', FANG:'Diamondback Energy', EQT:'EQT Corp', APA:'APA Corp',
  CTRA:'Coterra Energy', BKR:'Baker Hughes', VLO:'Valero Energy', NOV:'NOV Inc',
  TRGP:'Targa Resources', ET:'Energy Transfer', EPD:'Enterprise Products',
  // Utilities
  NEE:'NextEra Energy', DUK:'Duke Energy', SO:'Southern Company', D:'Dominion Energy',
  AEP:'American Electric Power', EXC:'Exelon', SRE:'Sempra Energy', PEG:'PSEG',
  ED:'Consolidated Edison', ETR:'Entergy', XEL:'Xcel Energy', WEC:'WEC Energy',
  ES:'Eversource Energy', DTE:'DTE Energy', AWK:'American Water Works',
  // Industrials & Machinery
  CAT:'Caterpillar', DE:'Deere & Company', HON:'Honeywell', GE:'GE Aerospace',
  ETN:'Eaton Corp', MMM:'3M', EMR:'Emerson Electric', ITW:'Illinois Tool Works',
  PCAR:'PACCAR', ROK:'Rockwell Automation', IR:'Ingersoll Rand', PH:'Parker Hannifin',
  LIN:'Linde',
  UNP:'Union Pacific', CSX:'CSX Corp', NSC:'Norfolk Southern', CARR:'Carrier Global',
  OTIS:'Otis Worldwide', JCI:'Johnson Controls', SWK:'Stanley Black & Decker',
  GWW:'W.W. Grainger', FAST:'Fastenal', ROP:'Roper Technologies',
  XYL:'Xylem', IEX:'IDEX Corp', AME:'AMETEK', DOV:'Dover Corp', FTV:'Fortive', GNRC:'Generac',
  // Mining & Materials
  FCX:'Freeport-McMoRan', NEM:'Newmont', GOLD:'Barrick Gold', AA:'Alcoa',
  VALE:'Vale', BHP:'BHP Group', RIO:'Rio Tinto', CLF:'Cleveland-Cliffs',
  ALB:'Albemarle (Lithium)', MP:'MP Materials', SCCO:'Southern Copper', WPM:'Wheaton Precious Metals', AG:'First Majestic Silver',
  // EV & Auto
  GM:'General Motors', F:'Ford', RIVN:'Rivian', TM:'Toyota',
  NIO:'Nio', LCID:'Lucid Group', HMC:'Honda', STLA:'Stellantis',
  LI:'Li Auto', XPEV:'Xpeng',
  // Space & Emerging Tech
  RKLB:'Rocket Lab', ASTS:'AST SpaceMobile', LUNR:'Intuitive Machines', JOBY:'Joby Aviation', ACHR:'Archer Aviation',
  // Aerospace & Defense
  LMT:'Lockheed Martin', RTX:'RTX Corp', NOC:'Northrop Grumman', BA:'Boeing',
  GD:'General Dynamics', HII:'Huntington Ingalls', LDOS:'Leidos', LHX:'L3Harris',
  TDG:'TransDigm', AXON:'Axon Enterprise', KTOS:'Kratos Defense',
  HEI:'HEICO', TXT:'Textron', DRS:'Leonardo DRS', TDY:'Teledyne Technologies',
  // Media & Streaming
  DIS:'Disney', CMCSA:'Comcast', SPOT:'Spotify', PSKY:'Paramount Sky Dance',
  WBD:'Warner Bros Discovery', FOXA:'Fox Corp', TTD:'The Trade Desk', ROKU:'Roku',
  SIRI:'Sirius XM', WMG:'Warner Music', IMAX:'IMAX Corp',
  // Gaming & Casinos
  EA:'Electronic Arts', TTWO:'Take-Two Interactive', RBLX:'Roblox',
  NTDOY:'Nintendo', SONY:'Sony Group', U:'Unity Software', NTES:'NetEase', PENN:'Penn Entertainment',
  LVS:'Las Vegas Sands', WYNN:'Wynn Resorts', MGM:'MGM Resorts', CZR:'Caesars Entertainment', DKNG:'DraftKings',
  // Telecom
  TMUS:'T-Mobile', VZ:'Verizon', T:'AT&T', AMX:'América Móvil',
  AMT:'American Tower', SBAC:'SBA Communications', CCI:'Crown Castle', LUMN:'Lumen Technologies',
  // Hotels & Travel
  MAR:'Marriott International', HLT:'Hilton Worldwide', H:'Hyatt Hotels', WH:'Wyndham Hotels',
  BKNG:'Booking Holdings', EXPE:'Expedia', LYV:'Live Nation', CCL:'Carnival Corp',
  RCL:'Royal Caribbean', NCLH:'Norwegian Cruise', VAC:'Marriott Vacations',
  // Airlines
  DAL:'Delta Air Lines', UAL:'United Airlines', LUV:'Southwest Airlines',
  ALK:'Alaska Air', AAL:'American Airlines', JBLU:'JetBlue', RYAAY:'Ryanair',
  // Shipping & Logistics
  UPS:'UPS', FDX:'FedEx', ODFL:'Old Dominion Freight', JBHT:'J.B. Hunt',
  ZIM:'ZIM Shipping', CHRW:'C.H. Robinson', XPO:'XPO', SAIA:'Saia',
  // Food & Restaurants
  MCD:"McDonald's", SBUX:'Starbucks', CMG:'Chipotle', YUM:'Yum! Brands',
  QSR:'Restaurant Brands', KHC:'Kraft Heinz', GIS:'General Mills',
  MDLZ:'Mondelez', TSN:'Tyson Foods', CPB:'Campbell Soup', HRL:'Hormel Foods',
  DPZ:"Domino's Pizza", WING:'Wingstop', SFM:'Sprouts Farmers Market',
  PFGC:'Performance Food Group', USFD:'US Foods',
  // Agriculture
  MOS:'Mosaic', NTR:'Nutrien', ADM:'Archer-Daniels-Midland', BG:'Bunge',
  CTVA:'Corteva', CF:'CF Industries', FMC:'FMC Corp', AGCO:'AGCO', ICL:'ICL Group',
  // Home Building & Construction
  DHI:'D.R. Horton', LEN:'Lennar', PHM:'PulteGroup', NVR:'NVR Inc', TOL:'Toll Brothers',
  KBH:'KB Home', MHO:'M/I Homes', BLD:'TopBuild', TREX:'Trex Company',
  VMC:'Vulcan Materials', MLM:'Martin Marietta Materials',
  // REITs
  PLD:'Prologis', EQIX:'Equinix', O:'Realty Income', SPG:'Simon Property',
  VICI:'VICI Properties', WELL:'Welltower', DLR:'Digital Realty',
  IRM:'Iron Mountain', WY:'Weyerhaeuser', ARE:'Alexandria Real Estate',
  EQR:'Equity Residential', AVB:'AvalonBay Communities', UDR:'UDR Inc', CPT:'Camden Property',
  MAA:'Mid-America Apartment', AMH:'American Homes 4 Rent', INVH:'Invitation Homes',
  NNN:'National Retail Properties', KIM:'Kimco Realty', REG:'Regency Centers',
  STAG:'STAG Industrial', REXR:'Rexford Industrial', FR:'First Industrial', EGP:'EastGroup Properties', COLD:'Americold',
  // E-Commerce & Gig
  SHOP:'Shopify', ETSY:'Etsy', EBAY:'eBay', W:'Wayfair',
  CHWY:'Chewy', CVNA:'Carvana', DASH:'DoorDash', UBER:'Uber', LYFT:'Lyft', ABNB:'Airbnb',
}

const INDUSTRIES = [
  {
    id:'mega', color:'#7c3aed', icon:'◈', name:'Mega Cap Tech (FAANG+)',
    desc:'The largest tech companies driving global markets',
    stocks:['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','NFLX','ORCL','ADBE','IBM'],
  },
  {
    id:'ai', color:'#6d28d9', icon:'◉', name:'AI & Machine Learning',
    desc:'Pure-play AI: compute, inference, software, quantum',
    stocks:['NVDA','PLTR','APP','SMCI','DELL','HPE','AI','SOUN','BBAI','IONQ','MRVL'],
  },
  {
    id:'semis', color:'#2563eb', icon:'◎', name:'Semiconductors',
    desc:'Chipmakers powering AI, mobile, data centers, and cloud',
    stocks:['TSM','NVDA','AMD','INTC','AVGO','QCOM','MU','AMAT','LRCX','ASML','TXN','MCHP','ON','SWKS','QRVO','MPWR','ADI','CRUS','WOLF'],
  },
  {
    id:'cyber', color:'#059669', icon:'◌', name:'Cybersecurity',
    desc:'Endpoint protection, zero-trust, SIEM, identity management',
    stocks:['CRWD','PANW','FTNT','ZS','NET','OKTA','S','TENB','VRNS','CHKP','QLYS','RPD','GEN','BB'],
  },
  {
    id:'cloud', color:'#0891b2', icon:'▣', name:'Cloud & SaaS',
    desc:'Cloud infrastructure, enterprise software, DevOps platforms',
    stocks:['AMZN','MSFT','GOOGL','CRM','NOW','SNOW','DDOG','MDB','HUBS','WDAY','GTLB','TWLO','ESTC'],
  },
  {
    id:'software', color:'#0e7490', icon:'▥', name:'Software & Dev Tools',
    desc:'Design, EDA, collaboration, workforce, and vertical SaaS',
    stocks:['CSCO','CDNS','SNPS','ADSK','PTC','ZM','TEAM','DOCU','PCTY','PAYC','MANH','VEEV'],
  },
  {
    id:'itsvcs', color:'#155e75', icon:'▤', name:'Enterprise Tech & IT Services',
    desc:'Consulting, IT outsourcing, hardware infrastructure',
    stocks:['ACN','CTSH','EPAM','IT','INFY','HPQ','NTAP','STX','WDC','FFIV','G'],
  },
  {
    id:'social', color:'#be185d', icon:'◉', name:'Social Media & Global Internet',
    desc:'Social platforms, global e-commerce, and search giants',
    stocks:['META','SNAP','PINS','RDDT','MTCH','BABA','JD','BIDU','PDD','MELI','SE'],
  },
  {
    id:'beverages', color:'#d97706', icon:'◐', name:'Beverages',
    desc:'Soft drinks, energy drinks, beer, spirits — Coke to Celsius',
    stocks:['KO','PEP','MNST','COKE','STZ','BUD','TAP','SAM','CELH','ABEV','FIZZ'],
  },
  {
    id:'staples', color:'#ca8a04', icon:'▤', name:'Consumer Staples & Big-Box',
    desc:'Warehouse clubs, big-box, discount, grocery, household goods',
    stocks:['COST','WMT','TGT','HD','LOW','TJX','DLTR','DG','KR','CLX','SYY','PG','CL','KMB','CHD','EL','BBWI','NWL','SHW'],
  },
  {
    id:'retail', color:'#b45309', icon:'◻', name:'Consumer Retail & Apparel',
    desc:'Specialty retail, athletic wear, auto retail, home furnishings',
    stocks:['NKE','LULU','RL','BBY','ULTA','DKS','AZO','ORLY','KMX','TSCO','WSM','RH','AN'],
  },
  {
    id:'health', color:'#0d9488', icon:'✦', name:'Healthcare & Pharma',
    desc:'Blockbuster drugs, managed care, GLP-1, biologics, distributors',
    stocks:['LLY','UNH','JNJ','ABBV','MRK','PFE','AMGN','BMY','GILD','REGN','NVO','CVS','HUM','CI','ELV','CNC','MCK','CAH'],
  },
  {
    id:'biotech', color:'#10b981', icon:'◇', name:'Biotech',
    desc:'Gene editing, mRNA, cell therapy, AI drug discovery',
    stocks:['MRNA','BIIB','VRTX','ILMN','ARWR','RXRX','NTLA','EDIT','CRSP','DNLI','ALNY','BMRN','INCY','EXEL','PTCT'],
  },
  {
    id:'meddev', color:'#14b8a6', icon:'✧', name:'Medical Devices & Life Sciences',
    desc:'Surgical robots, diagnostics, implants, lab instruments',
    stocks:['DHR','TMO','ABT','MDT','SYK','BSX','ISRG','EW','BDX','ZBH','DXCM','PODD','ALGN','WAT','IDXX','RMD'],
  },
  {
    id:'finance', color:'#1d4ed8', icon:'◆', name:'Financial Services',
    desc:'Money-center banks, payment networks, investment firms',
    stocks:['JPM','BAC','GS','MS','V','MA','AXP','BRK-B','WFC','C','COF','BX','SCHW','ICE','CME'],
  },
  {
    id:'assetmgmt', color:'#1e40af', icon:'◈', name:'Asset Management',
    desc:'Private equity, alternative assets, traditional fund managers',
    stocks:['BLK','APO','KKR','CG','BAM','TPG','ARES','STT','NTRS','IVZ','BEN','AMG'],
  },
  {
    id:'insurance', color:'#1e3a8a', icon:'◊', name:'Insurance',
    desc:'P&C, life, health insurance and specialty brokers',
    stocks:['PGR','ALL','TRV','CB','MET','PRU','AFL','HIG','AIG','AJG','MRSH','GL','UNM','EG','WRB'],
  },
  {
    id:'regbanks', color:'#312e81', icon:'▣', name:'Regional Banks',
    desc:'Mid-size US commercial and retail banks',
    stocks:['USB','PNC','TFC','RF','HBAN','KEY','CFG','FITB','MTB','ZION','WAL'],
  },
  {
    id:'fintech', color:'#3b82f6', icon:'◊', name:'FinTech & Crypto',
    desc:'Digital payments, crypto exchanges, BNPL, neobanks, Bitcoin proxies',
    stocks:['XYZ','PYPL','COIN','SOFI','AFRM','HOOD','NU','INTU','FISV','GPN','FIS','JKHY','BR','TOST','BILL','WEX','FOUR','RELY','MSTR','RIOT','MARA'],
  },
  {
    id:'energy', color:'#b45309', icon:'◑', name:'Energy',
    desc:'Oil & gas majors, refiners, pipelines, oilfield services',
    stocks:['XOM','CVX','COP','OXY','SLB','PSX','MPC','EOG','HAL','KMI','WMB','DVN','FANG','EQT','APA','CTRA','BKR','VLO','NOV','TRGP','ET','EPD'],
  },
  {
    id:'utilities', color:'#854d0e', icon:'○', name:'Utilities',
    desc:'Electric, gas, and water utilities — stable yield plays',
    stocks:['NEE','DUK','SO','D','AEP','EXC','SRE','PEG','ED','ETR','XEL','WEC','ES','DTE','AWK'],
  },
  {
    id:'industrial', color:'#64748b', icon:'◧', name:'Industrials & Machinery',
    desc:'Heavy equipment, automation, railroads, HVAC, industrial tools',
    stocks:['CAT','DE','HON','GE','ETN','MMM','EMR','ITW','PCAR','ROK','IR','PH','LIN','UNP','CSX','NSC','CARR','OTIS','JCI','SWK','GWW','FAST','ROP','XYL','IEX','AME','DOV','FTV','GNRC'],
  },
  {
    id:'mining', color:'#78716c', icon:'◩', name:'Mining & Materials',
    desc:'Copper, gold, silver, aluminum, lithium — commodities backbone',
    stocks:['FCX','NEM','GOLD','AA','VALE','BHP','RIO','CLF','ALB','MP','SCCO','WPM','AG'],
  },
  {
    id:'ev', color:'#16a34a', icon:'◎', name:'Electric Vehicles & Auto',
    desc:'EV leaders, legacy automakers, and Chinese EV challengers',
    stocks:['TSLA','GM','F','RIVN','TM','NIO','LCID','HMC','STLA','LI','XPEV'],
  },
  {
    id:'space', color:'#7e22ce', icon:'◎', name:'Space & Emerging Tech',
    desc:'Launch vehicles, satellite internet, urban air mobility',
    stocks:['RKLB','ASTS','LUNR','JOBY','ACHR'],
  },
  {
    id:'defense', color:'#475569', icon:'◀', name:'Aerospace & Defense',
    desc:'Missile systems, satellites, naval, defense electronics',
    stocks:['LMT','RTX','NOC','BA','GD','HII','LDOS','LHX','TDG','AXON','KTOS','HEI','TXT','DRS','TDY'],
  },
  {
    id:'media', color:'#db2777', icon:'▶', name:'Media & Streaming',
    desc:'Streaming platforms, content studios, advertising tech',
    stocks:['NFLX','DIS','CMCSA','SPOT','PSKY','WBD','FOXA','TTD','ROKU','SIRI','WMG','IMAX'],
  },
  {
    id:'gaming', color:'#9333ea', icon:'▷', name:'Gaming & Casinos',
    desc:'Game studios, gaming platforms, sports betting, casinos',
    stocks:['EA','TTWO','RBLX','NTDOY','SONY','U','NTES','PENN','LVS','WYNN','MGM','CZR','DKNG'],
  },
  {
    id:'telecom', color:'#4f46e5', icon:'○', name:'Telecommunications',
    desc:'Wireless carriers, fiber internet, cell tower infrastructure',
    stocks:['TMUS','VZ','T','AMX','AMT','SBAC','CCI','LUMN'],
  },
  {
    id:'hotels', color:'#be123c', icon:'◐', name:'Hotels & Travel',
    desc:'Hotel chains, cruise lines, booking platforms, live events',
    stocks:['MAR','HLT','H','WH','BKNG','EXPE','LYV','CCL','RCL','NCLH','VAC'],
  },
  {
    id:'airlines', color:'#0369a1', icon:'◁', name:'Airlines',
    desc:'US and global carriers — cyclical, fuel-sensitive sector',
    stocks:['DAL','UAL','LUV','ALK','AAL','JBLU','RYAAY'],
  },
  {
    id:'shipping', color:'#0f766e', icon:'◈', name:'Shipping & Logistics',
    desc:'Parcel delivery, freight trucking, ocean shipping',
    stocks:['UPS','FDX','ODFL','JBHT','ZIM','CHRW','XPO','SAIA'],
  },
  {
    id:'food', color:'#ea580c', icon:'●', name:'Food & Restaurants',
    desc:'Fast food chains, packaged foods, food processing, distributors',
    stocks:['MCD','SBUX','CMG','YUM','QSR','KHC','GIS','MDLZ','TSN','CPB','HRL','DPZ','WING','SFM','PFGC','USFD'],
  },
  {
    id:'agri', color:'#65a30d', icon:'◌', name:'Agriculture',
    desc:'Farm equipment, fertilizers, crop chemicals, grain trading',
    stocks:['DE','MOS','NTR','ADM','BG','CTVA','CF','FMC','AGCO','ICL'],
  },
  {
    id:'homebuild', color:'#a16207', icon:'▦', name:'Home Building & Construction',
    desc:'Homebuilders, building products, and construction materials',
    stocks:['DHI','LEN','PHM','NVR','TOL','KBH','MHO','BLD','TREX','VMC','MLM'],
  },
  {
    id:'reit', color:'#7c8794', icon:'▦', name:'Real Estate (REITs)',
    desc:'Data centers, industrial, residential, retail, healthcare REITs',
    stocks:['PLD','EQIX','AMT','O','SPG','VICI','WELL','DLR','IRM','WY','ARE','EQR','AVB','UDR','CPT','MAA','AMH','INVH','NNN','KIM','REG','STAG','REXR','FR','EGP','COLD'],
  },
  {
    id:'ecom', color:'#c026d3', icon:'◻', name:'E-Commerce & Gig Economy',
    desc:'Online retail, marketplace, rideshare, food delivery',
    stocks:['SHOP','ETSY','EBAY','W','CHWY','CVNA','DASH','UBER','LYFT','ABNB'],
  },
]

const ALL_SYMS = [...new Set(INDUSTRIES.flatMap(i => i.stocks))]
const REFRESH  = 60

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Explain side panel ────────────────────────────────────────────────────────

function ExplainPanel({ sym, name, price, changePct, explanation, explaining, onClose }) {
  const fmtP = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
  const open  = !!sym
  return (
    <>
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={onClose}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--bdr-mid)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.22s cubic-bezier(.4,0,.2,1)',
        zIndex: 100,
        display: 'flex', flexDirection: 'column',
        boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.5)' : 'none',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--cyan)' }}>{sym}</span>
              {price != null && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--t1)' }}>
                  ${price.toFixed(2)}
                </span>
              )}
              {changePct != null && (
                <span style={{ fontSize: 11, color: changePct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {fmtP(changePct)}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{name}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--t3)', fontSize: 16,
            cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', fontSize: 12, lineHeight: 1.7, color: 'var(--t2)' }}>
          {explaining && !explanation && (
            <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>Asking Claude…</span>
          )}
          {explanation && (
            <Markdown components={{
              h2: ({ children }) => <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', marginTop: 14, marginBottom: 4 }}>{children}</div>,
              h3: ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)', marginTop: 10, marginBottom: 2 }}>{children}</div>,
              p:  ({ children }) => <p style={{ marginBottom: 10 }}>{children}</p>,
              strong: ({ children }) => <strong style={{ color: 'var(--t1)', fontWeight: 600 }}>{children}</strong>,
              ul: ({ children }) => <ul style={{ paddingLeft: 16, marginBottom: 10 }}>{children}</ul>,
              li: ({ children }) => <li style={{ marginBottom: 3 }}>{children}</li>,
            }}>
              {explanation + (explaining ? ' ▍' : '')}
            </Markdown>
          )}
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--bdr)', fontSize: 10, color: 'var(--t3)' }}>
          Powered by Claude · For informational purposes only
        </div>
      </div>
    </>
  )
}

function IndustryCard({ industry, prices, history, loading, histLoading, checkpointedSymbols, onCheckpoint, activeSym, onAskWhy }) {
  const rows  = industry.stocks.map(sym => ({ sym, p: prices[sym], h: history[sym] }))
  const valid = rows.filter(r => r.p?.change_pct != null)
  const avg   = valid.length ? valid.reduce((s, r) => s + r.p.change_pct, 0) / valid.length : null

  const fmtPct = (v, isLoading) =>
    v == null ? (isLoading ? '…' : '—') : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
  const pctCls = (v) => v == null ? '' : v >= 0 ? 'gain-cell' : 'loss-cell'

  return (
    <div className="ind-card" style={{ '--ind': industry.color }}>
      <div className="ind-header">
        <span className="ind-icon">{industry.icon}</span>
        <div className="ind-meta">
          <div className="ind-name">{industry.name}</div>
          <div className="ind-desc">{industry.desc}</div>
        </div>
        {avg != null && (
          <div className={`ind-avg ${avg >= 0 ? 'gain-cell' : 'loss-cell'}`}>
            {avg >= 0 ? '▲' : '▼'} {Math.abs(avg).toFixed(2)}%
          </div>
        )}
      </div>
      <div className="ind-table-scroll">
        <table className="res-table">
          <thead>
            <tr>
              <th>Ticker</th><th>Company</th><th className="r">Price</th>
              <th className="r">Day</th><th className="r">5D</th><th className="r">1M</th><th className="r">6M</th><th className="r">1Y</th><th /><th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sym, p, h }) => {
              const priceStr = p?.price != null
                ? '$' + p.price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                : (loading ? '…' : '—')
              return (
                <tr key={sym}>
                  <td className="sym-cell res-ticker">{sym}</td>
                  <td className="res-name">{N[sym] || sym}</td>
                  <td className="r num-cell" style={{ color: 'var(--cyan)' }}>{priceStr}</td>
                  <td className={`r num-cell ${pctCls(p?.change_pct)}`}>{fmtPct(p?.change_pct, loading)}</td>
                  <td className={`r num-cell ${pctCls(h?.week_pct)}`}>{fmtPct(h?.week_pct,  histLoading)}</td>
                  <td className={`r num-cell ${pctCls(h?.month_pct)}`}>{fmtPct(h?.month_pct, histLoading)}</td>
                  <td className={`r num-cell ${pctCls(h?.sixmo_pct)}`}>{fmtPct(h?.sixmo_pct, histLoading)}</td>
                  <td className={`r num-cell ${pctCls(h?.year_pct)}`}>{fmtPct(h?.year_pct,   histLoading)}</td>
                  <td className="cp-cell">
                    {checkpointedSymbols?.has(sym) && <span className="cp-dot" />}
                    <button
                      className="cp-btn"
                      onClick={() => p?.price != null && onCheckpoint(sym, p.price, N[sym] || sym)}
                      disabled={p?.price == null}
                      title={`Checkpoint ${sym}`}
                    >⊕</button>
                  </td>
                  <td className="cp-cell">
                    <button
                      className="cp-btn"
                      style={{ color: activeSym === sym ? 'var(--cyan)' : undefined, opacity: p?.price == null ? 0.35 : 1 }}
                      onClick={() => onAskWhy(sym, p, h)}
                      disabled={p?.price == null}
                      title={`Why is ${sym} moving?`}
                    >?</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const HIST_REFRESH = 300 // re-fetch history every 5 minutes

export default function Research({ checkpoints = [], onCheckpoint }) {
  const [prices,      setPrices]      = useState({})
  const [history,     setHistory]     = useState({})
  const [loading,     setLoading]     = useState(true)
  const [histLoading, setHistLoading] = useState(true)
  const [updated,     setUpdated]     = useState(null)
  const [countdown,   setCountdown]   = useState(REFRESH)
  const fetchingRef     = useRef(false)
  const histFetchingRef = useRef(false)

  const [activeSym,   setActiveSym]   = useState(null)
  const [activeData,  setActiveData]  = useState({})
  const [explanation, setExplanation] = useState('')
  const [explaining,  setExplaining]  = useState(false)

  const askWhy = async (sym, p, h) => {
    if (activeSym === sym) { setActiveSym(null); return }
    setActiveSym(sym)
    setActiveData({ price: p?.price, changePct: p?.change_pct, name: N[sym] || sym })
    setExplanation('')
    setExplaining(true)
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: sym, name: N[sym] || sym,
          price: p?.price, change_pct: p?.change_pct,
          week_pct: h?.week_pct, month_pct: h?.month_pct,
          sixmo_pct: h?.sixmo_pct, year_pct: h?.year_pct,
        }),
      })
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') { setExplaining(false); return }
          try { setExplanation(prev => prev + JSON.parse(payload).text) } catch {}
        }
      }
    } catch {
      setExplanation('Failed to load explanation.')
    }
    setExplaining(false)
  }

  const fetchAll = async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    try {
      const res  = await fetch(`/market/prices?symbols=${ALL_SYMS.join(',')}`)
      const data = res.ok ? await res.json() : {}
      setPrices(data)
      setUpdated(new Date())
      setCountdown(REFRESH)
    } catch {}
    setLoading(false)
    fetchingRef.current = false
  }

  const fetchHistory = async () => {
    if (histFetchingRef.current) return
    histFetchingRef.current = true
    setHistLoading(true)
    try {
      const res  = await fetch(`/market/history?symbols=${ALL_SYMS.join(',')}`)
      const data = res.ok ? await res.json() : {}
      setHistory(data)
    } catch {}
    setHistLoading(false)
    histFetchingRef.current = false
  }

  const handleRefresh = () => { fetchAll(); fetchHistory() }

  useEffect(() => {
    fetchAll()
    fetchHistory()
    const rid  = setInterval(fetchAll,    REFRESH      * 1000)
    const hid  = setInterval(fetchHistory, HIST_REFRESH * 1000)
    const cid  = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => { clearInterval(rid); clearInterval(hid); clearInterval(cid) }
  }, [])

  const timeStr = updated
    ? updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—'

  return (
    <div>
      <ExplainPanel
        sym={activeSym}
        name={activeData.name}
        price={activeData.price}
        changePct={activeData.changePct}
        explanation={explanation}
        explaining={explaining}
        onClose={() => setActiveSym(null)}
      />

      <div className="trades-panel-header">
        <div className="trades-title">
          Industry Research
          <span className="trades-count">
            ({ALL_SYMS.length} stocks · {INDUSTRIES.length} sectors)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
            {updated ? `Updated ${timeStr} · ` : ''}{loading ? 'Loading…' : `Refreshes in ${countdown}s`}
          </span>
          <button className="btn btn-ghost" onClick={handleRefresh} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? '↻ Loading…' : '↻ Refresh Now'}
          </button>
        </div>
      </div>

      <div className="research-grid">
        {INDUSTRIES.map(ind => (
          <IndustryCard key={ind.id} industry={ind} prices={prices} history={history}
            loading={loading} histLoading={histLoading}
            checkpointedSymbols={new Set(checkpoints.map(c => c.symbol))}
            onCheckpoint={onCheckpoint}
            activeSym={activeSym}
            onAskWhy={askWhy} />
        ))}
      </div>
    </div>
  )
}

// All texts the bot shows to people. om = Afaan Oromoo, am = Amharic, en = English.
// ⚠️ Ask a native speaker to review the Oromo and Amharic before launch: just edit the strings.
// {placeholders} are filled in by the bot.

export const LANGS = ['om', 'am', 'en'];
export const LANG_LABELS = { om: 'Afaan Oromoo', am: 'አማርኛ', en: 'English' };

// Bot profile texts: Telegram shows them before the customer picks a language, so all three
// languages are in one string. Limits: description 512, short description 120 characters.
const DESCRIPTION = [
  '🚲 {brand}: order food from shops and restaurants in Shashamane, delivered to you by bicycle. Tap Start to order.',
  '🚲 {brand}: suuqiiwwanii fi mana nyaataa Shashamannee irraa nyaata ajajadhaa, saayikiliin isinii geessina. Ajajuuf Start tuqaa.',
  '🚲 {brand}፦ ከሻሸመኔ ሱቆችና ምግብ ቤቶች ምግብ ይዘዙ፣ በብስክሌት እናደርስልዎታለን። ለማዘዝ Start ይንኩ።',
].join('\n\n');
const SHORT_DESCRIPTION = '🚲 {brand} · Shashamane delivery by bicycle · Geejjiba saayikilii Shashamannee · በሻሸመኔ በብስክሌት ማድረስ';

const S = {
  // ---------- customer ----------
  chooseLang: {
    en: 'Choose your language 👇',
    om: 'Afaan keessan filadhaa 👇',
    am: 'ቋንቋዎን ይምረጡ 👇',
  },
  // Bot profile (set at startup): the same trilingual text in every language
  botDescription: { en: DESCRIPTION, om: DESCRIPTION, am: DESCRIPTION },
  botShortDescription: { en: SHORT_DESCRIPTION, om: SHORT_DESCRIPTION, am: SHORT_DESCRIPTION },
  // Welcome screen: picture banner (short texts drawn on the image) + caption (HTML)
  welcomeCaption: {
    en: '<b>Welcome to {brand}! 👋</b>\n\n1️⃣ Pick a shop and your food\n2️⃣ Send your location\n3️⃣ Pay the shop, and a rider brings it',
    om: '<b>Baga gara {brand} dhuftan! 👋</b>\n\n1️⃣ Suuqii fi nyaata keessan filadhaa\n2️⃣ Bakka jirtan ergaa\n3️⃣ Suuqiif kaffalaa, geessaan isinii fida',
    am: '<b>እንኳን ወደ {brand} በደህና መጡ! 👋</b>\n\n1️⃣ ሱቅና ምግብዎን ይምረጡ\n2️⃣ አካባቢዎን ይላኩ\n3️⃣ ለሱቁ ይክፈሉ፣ አድራሹ ያመጣልዎታል',
  },
  bannerSlogan: { en: 'Order. Relax. It\'s coming.', om: 'Ajajadhaa. Boqodhaa. Ni dhufa.', am: 'ይዘዙ። ዘና ይበሉ። እየመጣ ነው።' },
  bannerTagline: {
    en: 'Shashamane · delivered by bicycle',
    om: 'Shashamannee · saayikiliin isinii geessina',
    am: 'ሻሸመኔ · በብስክሌት እናደርስልዎታለን',
  },
  bannerCta: { en: 'Start an order', om: 'Ajaja jalqabi', am: 'ትዕዛዝ ይጀምሩ' },
  btnStartOrder: { en: '🛍 Start an order', om: '🛍 Ajaja jalqabi', am: '🛍 ትዕዛዝ ይጀምሩ' },
  langSet: { en: '🌐 English ✅', om: '🌐 Afaan Oromoo ✅', am: '🌐 አማርኛ ✅' },
  homeLine: { en: '🏠 Home', om: '🏠 Fuula jalqabaa', am: '🏠 መነሻ' },
  btnOrder: { en: '🛍 Order', om: '🛍 Ajajuu', am: '🛍 ይዘዙ' },
  btnMyOrders: { en: '📦 My orders', om: '📦 Ajajawwan koo', am: '📦 ትዕዛዞቼ' },
  btnHelp: { en: '☎️ Help', om: '☎️ Gargaarsa', am: '☎️ እርዳታ' },
  btnLang: { en: '🌐 Language', om: '🌐 Afaan', am: '🌐 ቋንቋ' },
  helpText: {
    en: 'Need help? Call us: {phone}\n\nHow it works:\n1. Choose a shop and items\n2. Share location + phone\n3. The shop accepts, then you pay the shop by Telebirr/CBE\n4. Send us the transaction reference\n5. A rider brings your order. Pay the delivery fee to the rider in cash.',
    om: 'Gargaarsa barbaadduu? Nu bilbilaa: {phone}\n\nAkkamitti hojjeta:\n1. Suuqii fi meeshaa filadhaa\n2. Bakka jirtanii fi bilbila qooddadhaa\n3. Suuqiin ni fudhata, achiis Telebirr/CBE tiin suuqiif kaffalaa\n4. Lakkoofsa ragaa kaffaltii nuuf ergaa\n5. Geessaan ajaja keessan isinii fida. Kaffaltii geejjibaa geessaaf maallaqa harkaan kaffalaa.',
    am: 'እርዳታ ይፈልጋሉ? ይደውሉልን፦ {phone}\n\nእንዴት እንደሚሰራ፦\n1. ሱቅና ዕቃዎችን ይምረጡ\n2. አካባቢዎንና ስልክዎን ያጋሩ\n3. ሱቁ ሲቀበል በቴሌብር/CBE ለሱቁ ይክፈሉ\n4. የግብይት ማጣቀሻ ቁጥሩን ይላኩልን\n5. አድራሹ ትዕዛዝዎን ያመጣል። የማድረሻ ክፍያውን ለአድራሹ በጥሬ ገንዘብ ይክፈሉ።',
  },
  chooseMerchant: {
    en: 'Choose where to order from:',
    om: 'Eessaa akka ajajattan filadhaa:',
    am: 'ከየት እንደሚያዝዙ ይምረጡ፦',
  },
  noMerchants: {
    en: 'No shops are open right now. Please try again later.',
    om: 'Amma suuqiin banaa ta\'e hin jiru. Maaloo booda irra deebi\'aa yaalaa.',
    am: 'አሁን ክፍት የሆነ ሱቅ የለም። እባክዎ ቆይተው ይሞክሩ።',
  },
  // Checkout steps (HTML): progress line, bold instruction, one-line help, example in italics
  stepOf: { en: 'Step {n} of 4', om: 'Tarkaanfii {n} kan 4', am: 'ደረጃ {n} ከ4' },
  menuHint: {
    en: '<b>Tap ➕ to add food</b>\n<i>Not on the menu? Tap ✍️ Write a request.</i>',
    om: '<b>Nyaata dabaluuf ➕ tuqaa</b>\n<i>Menu irra hin jiruu? ✍️ Gaaffii barreessi tuqaa.</i>',
    am: '<b>ምግብ ለመጨመር ➕ ይንኩ</b>\n<i>ምናሌው ላይ የለም? ✍️ ጥያቄ ይጻፉን ይንኩ።</i>',
  },
  cartNext: {
    en: '🛒 Next · {count} items · {total} ➜',
    om: '🛒 Itti aanu · meeshaa {count} · {total} ➜',
    am: '🛒 ቀጣይ · {count} ዕቃ · {total} ➜',
  },
  cartNextRequest: {
    en: '🛒 Next · your request ➜',
    om: '🛒 Itti aanu · gaaffii keessan ➜',
    am: '🛒 ቀጣይ · ጥያቄዎ ➜',
  },
  btnShops: { en: '⬅️ Shops', om: '⬅️ Suuqiiwwan', am: '⬅️ ሱቆች' },
  btnStepBack: { en: '⬅️ Back', om: '⬅️ Duubatti', am: '⬅️ ተመለስ' },
  btnStepCancel: { en: '❌ Cancel', om: '❌ Dhiisi', am: '❌ ሰርዝ' },
  btnEdit: { en: '✏️ Edit', om: '✏️ Jijjiiri', am: '✏️ አስተካክል' },
  almostDone: { en: '✅ Almost done!', om: '✅ Xumuruuf dhiyaattaniittu!', am: '✅ ሊጨርሱ ነው!' },
  payShopTag: { en: 'pay the shop', om: 'suuqiif kaffalaa', am: 'ለሱቁ ይክፈሉ' },
  cashRiderTag: { en: 'cash to the rider', om: 'geessaaf maallaqa harkaa', am: 'ለአድራሹ በጥሬ ገንዘብ' },
  yourOrder: { en: '🧺 Your order:', om: '🧺 Ajaja keessan:', am: '🧺 ትዕዛዝዎ፦' },
  empty: { en: '(empty)', om: '(duwwaa)', am: '(ባዶ)' },
  food: { en: 'Food', om: 'Nyaata', am: 'ምግብ' },
  shop: { en: 'Shop', om: 'Suuqii', am: 'ሱቅ' },
  plusCustom: {
    en: '+ your request (shop will set the price)',
    om: '+ gaaffii keessan (gatii suuqiitu murteessa)',
    am: '+ ጥያቄዎ (ዋጋውን ሱቁ ይወስናል)',
  },
  priceByShop: { en: 'price set by the shop', om: 'gatii suuqiitu murteessa', am: 'ዋጋውን ሱቁ ይወስናል' },
  btnCustom: { en: '✍️ Write a request', om: '✍️ Gaaffii barreessi', am: '✍️ ጥያቄ ይጻፉ' },
  btnClear: { en: '🗑 Clear', om: '🗑 Haqi', am: '🗑 አጽዳ' },
  askCustom: {
    en: 'Type what you want, e.g. "2 shiro, 1 mango juice":',
    om: 'Waan barbaaddan barreessaa, fkn. "shiroo 2, juusii maangoo 1":',
    am: 'የሚፈልጉትን ይጻፉ፣ ለምሳሌ "2 ሽሮ፣ 1 የማንጎ ጭማቂ"፦',
  },
  customSaved: { en: 'Request added ✅', om: 'Gaaffiin dabalameera ✅', am: 'ጥያቄዎ ተጨምሯል ✅' },
  cartEmptyWarn: {
    en: 'Your order is empty. Add something first.',
    om: 'Ajajni keessan duwwaa dha. Dura waa dabalaa.',
    am: 'ትዕዛዝዎ ባዶ ነው። መጀመሪያ የሆነ ነገር ይጨምሩ።',
  },
  staleButton: {
    en: 'This menu is old. Please start again with 🛍 Order.',
    om: 'Menuun kun moofaa dha. Maaloo 🛍 Ajajuu tiin irra deebi\'aa jalqabaa.',
    am: 'ይህ ምናሌ የቆየ ነው። እባክዎ በ🛍 ይዘዙ እንደገና ይጀምሩ።',
  },
  askLocation: {
    en: '<b>📍 Where should we deliver?</b>\nTurn on GPS, then tap 📍 Send my location below.\n<i>On a computer? Paste a Google Maps link or coordinates (e.g. 7.2001, 38.5995), or tap ⏭ Skip and the rider will call you.</i>',
    om: '<b>📍 Eessatti isinii haa geessinu?</b>\nGPS banaatii 📍 Bakka koo ergi armaan gadii tuqaa.\n<i>Kompiitara irra jirtuu? Liinkii Google Maps ykn koordineetii (fkn. 7.2001, 38.5995) maxxansaa, ykn ⏭ Darbi tuqaa geessaan isin bilbila.</i>',
    am: '<b>📍 የት እናድርስልዎ?</b>\nGPS ያብሩና ከታች 📍 አካባቢዬን ላክን ይንኩ።\n<i>በኮምፒውተር ነዎት? የGoogle Maps ሊንክ ወይም መጋጠሚያ (ለምሳሌ 7.2001, 38.5995) ይለጥፉ፣ ወይም ⏭ እለፍን ይንኩ አድራሹ ይደውልልዎታል።</i>',
  },
  btnShareLocation: { en: '📍 Send my location', om: '📍 Bakka koo ergi', am: '📍 አካባቢዬን ላክ' },
  btnSkip: { en: '⏭ Skip', om: '⏭ Darbi', am: '⏭ እለፍ' },
  outOfRange: {
    en: 'Sorry 🙏 you are about {km} km from the shop. For now we deliver up to {max} km.',
    om: 'Dhiifama 🙏 suuqii irraa gara km {km} fagaattu. Ammaaf hanga km {max} qofa geessina.',
    am: 'ይቅርታ 🙏 ከሱቁ {km} ኪ.ሜ ያህል ይርቃሉ። ለጊዜው እስከ {max} ኪ.ሜ ብቻ እናደርሳለን።',
  },
  askLandmark: {
    en: '<b>🏠 What\'s near you?</b>\nType a landmark so the rider can find you, and send it.\n<i>e.g. Near Abyssinia Bank, blue gate</i>',
    om: '<b>🏠 Maaltu isinitti dhiyaata?</b>\nAkka geessaan isin argatuuf mallattoo barreessaatii ergaa.\n<i>fkn. Baankii Abisiiniyaa bira, karra cuquliisa</i>',
    am: '<b>🏠 በአቅራቢያዎ ምን አለ?</b>\nአድራሹ እንዲያገኝዎ ምልክት ይጻፉና ይላኩ።\n<i>ለምሳሌ፦ አቢሲንያ ባንክ አጠገብ፣ ሰማያዊ በር</i>',
  },
  landmarkTooShort: {
    en: 'Please write a little more so the rider can find you.',
    om: 'Akka geessaan isin argatuuf maaloo xiqqoo dabalaa barreessaa.',
    am: 'አድራሹ እንዲያገኝዎ እባክዎ ትንሽ ተጨማሪ ይጻፉ።',
  },
  askPhone: {
    en: '<b>📞 What\'s your phone number?</b>\nTap 📞 Send my number below, or type it. The rider calls you if needed.\n<i>e.g. 0911234567</i>',
    om: '<b>📞 Lakkoofsi bilbila keessanii meeqa?</b>\n📞 Lakkoofsa koo ergi armaan gadii tuqaa, ykn barreessaa. Yoo barbaachise geessaan isin bilbila.\n<i>fkn. 0911234567</i>',
    am: '<b>📞 ስልክ ቁጥርዎ ስንት ነው?</b>\nከታች 📞 ቁጥሬን ላክን ይንኩ፣ ወይም ይጻፉ። ካስፈለገ አድራሹ ይደውልልዎታል።\n<i>ለምሳሌ፦ 0911234567</i>',
  },
  btnSharePhone: { en: '📞 Send my number', om: '📞 Lakkoofsa koo ergi', am: '📞 ቁጥሬን ላክ' },
  badPhone: {
    en: 'That number doesn\'t look right. Example: 0911234567',
    om: 'Lakkoofsi sun sirrii hin fakkaatu. Fakkeenya: 0911234567',
    am: 'ቁጥሩ ትክክል አይመስልም። ምሳሌ፦ 0911234567',
  },
  summaryTitle: { en: '🧾 Order summary', om: '🧾 Cuunfaa ajajaa', am: '🧾 የትዕዛዝ ማጠቃለያ' },
  deliveryFee: { en: 'Delivery', om: 'Geejjiba', am: 'ማድረሻ' },
  serviceFee: { en: 'Service', om: 'Tajaajila', am: 'አገልግሎት' },
  btnConfirm: { en: '✅ Place order', om: '✅ Ajaja ergi', am: '✅ ትዕዛዝ ላክ' },
  btnCancel: { en: '❌ Cancel', om: '❌ Dhiisi', am: '❌ ሰርዝ' },
  orderPlaced: {
    en: '📨 Order <code>{id}</code> sent to {merchant}. Waiting for them to accept ⏳',
    om: '📨 Ajajni <code>{id}</code> gara {merchant} ergameera. Hanga fudhatanitti eegaa ⏳',
    am: '📨 ትዕዛዝ <code>{id}</code> ወደ {merchant} ተልኳል። እስኪቀበሉ ይጠብቁ ⏳',
  },
  orderCancelled: { en: 'Order <code>{id}</code> cancelled.', om: 'Ajajni <code>{id}</code> haqameera.', am: 'ትዕዛዝ <code>{id}</code> ተሰርዟል።' },
  cartCancelled: { en: 'Cancelled.', om: 'Dhiifameera.', am: 'ተሰርዟል።' },
  orderRejected: {
    en: 'Sorry 🙏 {merchant} can\'t take order <code>{id}</code> right now. Please try another shop.',
    om: 'Dhiifama 🙏 {merchant} amma ajaja <code>{id}</code> fudhachuu hin danda\'u. Maaloo suuqii biraa yaalaa.',
    am: 'ይቅርታ 🙏 {merchant} አሁን ትዕዛዝ <code>{id}</code>ን መቀበል አይችልም። እባክዎ ሌላ ሱቅ ይሞክሩ።',
  },
  // Oromo and Amharic payment-guide copy below is a careful draft: needs native review.
  payNow: {
    en: '<b>✅ {merchant} accepted your order!</b> · <code>{id}</code>\n▰▰▱  Payment · 2 easy steps\n\n<b>1️⃣ Send {food} to the shop</b>\n{accounts}\n{tapToCopy}\n\n<b>2️⃣ Send the reference number here</b>\nIt\'s in the SMS you get after paying, e.g. <code>CK12AB34CD</code>\n\n🚲 Have <b>{fees} cash</b> ready for the rider.',
    om: '<b>✅ {merchant} ajaja keessan fudhateera!</b> · <code>{id}</code>\n▰▰▱  Kaffaltii · tarkaanfii 2\n\n<b>1️⃣ {food} suuqiif kaffalaa</b>\n{accounts}\n{tapToCopy}\n\n<b>2️⃣ Lakkoofsa ragaa kaffaltii asitti ergaa</b>\nErga kaffaltanii booda SMS argattan keessa jira, fkn. <code>CK12AB34CD</code>\n\n🚲 Yeroo ajajni dhufu <b>{fees}</b> geessaaf maallaqa harkaan qopheessaa.',
    am: '<b>✅ {merchant} ትዕዛዝዎን ተቀብሏል!</b> · <code>{id}</code>\n▰▰▱  ክፍያ · 2 ቀላል ደረጃዎች\n\n<b>1️⃣ {food} ለሱቁ ይክፈሉ</b>\n{accounts}\n{tapToCopy}\n\n<b>2️⃣ የማጣቀሻ ቁጥሩን እዚህ ይላኩ</b>\nከከፈሉ በኋላ በሚደርስዎ SMS ውስጥ አለ፣ ለምሳሌ <code>CK12AB34CD</code>\n\n🚲 ትዕዛዙ ሲደርስ <b>{fees}</b> ለአድራሹ በጥሬ ገንዘብ ያዘጋጁ።',
  },
  payTapToCopy: {
    en: '👆 Tap a number to copy it',
    om: '👆 Lakkoofsa tuqaatii garagalchaa (copy)',
    am: '👆 ቁጥሩን ነክተው ይቅዱት (copy)',
  },
  btnWhereRef: {
    en: '❓ Where do I find the reference?',
    om: '❓ Lakkoofsa ragaa eessatti argadha?',
    am: '❓ የማጣቀሻ ቁጥሩን የት አገኛለሁ?',
  },
  btnCallShop: {
    en: '📞 Call the shop',
    om: '📞 Suuqiif bilbilaa',
    am: '📞 ሱቁን ይደውሉ',
  },
  btnCancelOrder: {
    en: '❌ Cancel order',
    om: '❌ Ajaja haqi',
    am: '❌ ትዕዛዝ ሰርዝ',
  },
  payGuideText: {
    en: '<b>❓ Where is the reference number?</b>\n\n📱 <b>Telebirr:</b> after you pay, you get an SMS from 127 / Telebirr. It includes the transaction number (letters and digits, e.g. <code>CK12AB34CD</code>).\n\n🏦 <b>CBE Birr / CBE mobile banking:</b> the SMS or receipt shows a reference starting with <code>FT…</code>.\n\nCopy that code and send it here in this chat.',
    om: '<b>❓ Lakkoofsi ragaa eessa jira?</b>\n\n📱 <b>Telebirr:</b> erga kaffaltanii booda SMS 127 / Telebirr irraa isiniif dhufa. Keessatti lakkoofsi tiraansaakshinii (qubee fi lakkoofsa, fkn. <code>CK12AB34CD</code>) argama.\n\n🏦 <b>CBE Birr / CBE mobile banking:</b> SMS yookaan rasiidiin lakkoofsa ragaa <code>FT…</code>n eegalu agarsiisa.\n\nLakkoofsa sana garagalchitanii (copy) asitti ergaa.',
    am: '<b>❓ የማጣቀሻ ቁጥሩ የት ነው?</b>\n\n📱 <b>ቴሌብር፦</b> ከከፈሉ በኋላ ከ127 / Telebirr SMS ይደርስዎታል። በውስጡ የግብይት ቁጥሩ (ፊደላትና ቁጥሮች፣ ለምሳሌ <code>CK12AB34CD</code>) አለ።\n\n🏦 <b>CBE Birr / CBE mobile banking፦</b> SMS ወይም ደረሰኙ በ<code>FT…</code> የሚጀምር ማጣቀሻ ያሳያል።\n\nያንን ቁጥር ቀድተው እዚህ ይላኩ።',
  },
  shopPhoneLine: {
    en: '📞 {name}: {phone}',
    om: '📞 {name}: {phone}',
    am: '📞 {name}: {phone}',
  },
  accountName: { en: 'Name', om: 'Maqaa', am: 'ስም' },
  badRef: {
    en: 'Please send only the reference number (letters and numbers, e.g. CK12AB34CD).',
    om: 'Maaloo lakkoofsa ragaa qofa ergaa (qubee fi lakkoofsa, fkn. CK12AB34CD).',
    am: 'እባክዎ የማጣቀሻ ቁጥሩን ብቻ ይላኩ (ፊደላትና ቁጥሮች፣ ለምሳሌ CK12AB34CD)።',
  },
  refUsed: {
    en: '⚠️ This reference number was already used for another order. Please check it.',
    om: '⚠️ Lakkoofsi ragaa kun ajaja biraaf fayyadameera. Maaloo ilaalaa.',
    am: '⚠️ ይህ የማጣቀሻ ቁጥር ለሌላ ትዕዛዝ ጥቅም ላይ ውሏል። እባክዎ ያረጋግጡ።',
  },
  refReceived: {
    en: '<b>Got it ✅</b> The shop is checking your payment.',
    om: '<b>Argameera ✅</b> Suuqiin kaffaltii keessan ilaalaa jira.',
    am: '<b>ደርሶናል ✅</b> ሱቁ ክፍያዎን እያረጋገጠ ነው።',
  },
  payNotFound: {
    en: '<b>⚠️ The shop could not find your payment for order <code>{id}</code>.</b>\nPlease check and send the correct reference number.',
    om: '<b>⚠️ Suuqiin kaffaltii ajaja <code>{id}</code> hin arganne.</b>\nMaaloo ilaalaatii lakkoofsa ragaa sirrii ergaa.',
    am: '<b>⚠️ ሱቁ ለትዕዛዝ <code>{id}</code> ክፍያዎን አላገኘም።</b>\nእባክዎ አረጋግጠው ትክክለኛውን የማጣቀሻ ቁጥር ይላኩ።',
  },
  noOrders: { en: 'You have no orders yet.', om: 'Ammatti ajaja hin qabdan.', am: 'እስካሁን ትዕዛዝ የለዎትም።' },
  myOrdersTitle: { en: '📦 Your recent orders:', om: '📦 Ajajawwan keessan dhihoo:', am: '📦 የቅርብ ጊዜ ትዕዛዞችዎ፦' },
  cantCancel: {
    en: 'This order can\'t be cancelled now. Call us: {phone}',
    om: 'Ajaja kana amma haquun hin danda\'amu. Nu bilbilaa: {phone}',
    am: 'ይህን ትዕዛዝ አሁን መሰረዝ አይቻልም። ይደውሉልን፦ {phone}',
  },
  useMenu: {
    en: 'Use the buttons below 👇',
    om: 'Button armaan gadii fayyadamaa 👇',
    am: 'ከታች ያሉትን ቁልፎች ይጠቀሙ 👇',
  },
  error: {
    en: 'Something went wrong. Please try again.',
    om: 'Rakkoon uumameera. Maaloo irra deebi\'aa yaalaa.',
    am: 'ችግር ተፈጥሯል። እባክዎ እንደገና ይሞክሩ።',
  },

  // ---------- delivery time ----------
  etaLine: {
    en: '🕒 Delivery time: about {min}–{max} min',
    om: '🕒 Yeroo geejjibaa: gara daqiiqaa {min}–{max}',
    am: '🕒 የማድረሻ ጊዜ፦ ከ{min}–{max} ደቂቃ ገደማ',
  },

  // ---------- live order tracker ----------
  // Oromo and Amharic tracker copy below is a careful draft: needs native review.
  // Bar labels under the picture card (short: 6 fit side by side)
  stageSent: { en: 'Sent', om: 'Ergameera', am: 'ተልኳል' },
  stageAccepted: { en: 'Accepted', om: 'Fudhateera', am: 'ተቀብሏል' },
  stagePaid: { en: 'Paid', om: 'Kaffalameera', am: 'ተከፍሏል' },
  stageRider: { en: 'Rider', om: 'Geessaa', am: 'አድራሽ' },
  stageComing: { en: 'Coming', om: 'Karaa irra', am: 'በመንገድ ላይ' },
  stageDone: { en: 'Done', om: 'Geessameera', am: 'ደርሷል' },
  // Big title on the picture card, per stage
  cardTitle1: { en: 'Waiting for the shop', om: 'Suuqii eegaa jirra', am: 'ሱቁን በመጠበቅ ላይ' },
  cardTitle2: { en: 'Waiting for your payment', om: 'Kaffaltii keessan eegaa', am: 'ክፍያዎን በመጠበቅ ላይ' },
  cardTitle3: { en: 'Preparing your food', om: 'Nyaanni qophaa\'aa jira', am: 'ምግብዎ እየተዘጋጀ ነው' },
  cardTitle4: { en: 'A rider is assigned', om: 'Geessaan argameera', am: 'አድራሽ ተመድቧል' },
  cardTitle5: { en: 'On the way to you', om: 'Gara keessanitti dhufaa jira', am: 'ወደ እርስዎ እየመጣ ነው' },
  cardTitle6: { en: 'Delivered · thank you!', om: 'Geessameera · galatoomaa!', am: 'ደርሷል · እናመሰግናለን!' },
  // Timeline lines in the card caption (✅ done, 🟢 now, ⚪ to come)
  timeline1: { en: 'Sent to the shop', om: 'Suuqiif ergameera', am: 'ወደ ሱቁ ተልኳል' },
  timeline2: { en: 'Shop accepted · you pay the shop', om: 'Suuqiin fudhateera · suuqiif kaffalaa', am: 'ሱቁ ተቀብሏል · ለሱቁ ይክፈሉ' },
  timeline3: { en: 'Payment confirmed · preparing', om: 'Kaffaltiin mirkanaa\'eera · qophaa\'aa jira', am: 'ክፍያ ተረጋግጧል · እየተዘጋጀ ነው' },
  timeline4: { en: 'Rider assigned', om: 'Geessaan argameera', am: 'አድራሽ ተመድቧል' },
  timeline5: { en: 'On the way to you', om: 'Gara keessanitti karaa irra', am: 'ወደ እርስዎ በመንገድ ላይ' },
  timeline6: { en: 'Delivered', om: 'Geessameera', am: 'ደርሷል' },
  etaRange: { en: '{min}–{max} min', om: 'daqiiqaa {min}–{max}', am: '{min}–{max} ደቂቃ' },
  cashReady: {
    en: '🚲 Have <b>{cash} cash</b> ready for the rider.',
    om: '🚲 <b>{cash}</b> geessaaf maallaqa harkaan qopheessaa.',
    am: '🚲 <b>{cash}</b> ለአድራሹ በጥሬ ገንዘብ ያዘጋጁ።',
  },
  btnCallRider: { en: '📞 Call rider', om: '📞 Geessaa bilbilaa', am: '📞 አድራሹን ይደውሉ' },
  riderPhoneLine: {
    en: '🚲 Your rider <b>{name}</b>: {phone}',
    om: '🚲 Geessaan keessan <b>{name}</b>: {phone}',
    am: '🚲 አድራሽዎ <b>{name}</b>፦ {phone}',
  },
  // Headlines: short messages that stay in the chat above the live card (HTML)
  hlPaid: {
    en: '<b>💚 Payment confirmed!</b> Your order <code>{id}</code> is being prepared.\n🕒 Estimated arrival: in about {min}–{max} min',
    om: '<b>💚 Kaffaltiin mirkanaa\'eera!</b> Ajajni <code>{id}</code> keessan qophaa\'aa jira.\n🕒 Gahiinsa tilmaamame: daqiiqaa {min}–{max} keessatti',
    am: '<b>💚 ክፍያዎ ተረጋግጧል!</b> ትዕዛዝ <code>{id}</code> እየተዘጋጀ ነው።\n🕒 የሚደርስበት ግምት፦ በ{min}–{max} ደቂቃ ውስጥ',
  },
  hlRider: {
    en: '🚲 <b>{rider}</b> will deliver order <code>{id}</code>. Phone: {phone}',
    om: '🚲 <b>{rider}</b> ajaja <code>{id}</code> isinii geessa. Bilbila: {phone}',
    am: '🚲 <b>{rider}</b> ትዕዛዝ <code>{id}</code>ን ያደርስልዎታል። ስልክ፦ {phone}',
  },
  hlComing: {
    en: '<b>🚲 Order <code>{id}</code> is on the way!</b> Have {fees} ready for the rider.\n⏱ Arriving in about {min}–{max} min.',
    om: '<b>🚲 Ajajni <code>{id}</code> karaa irra jira!</b> {fees} geessaaf qopheessaa.\n⏱ Daqiiqaa {min}–{max} keessatti ni gaha.',
    am: '<b>🚲 ትዕዛዝ <code>{id}</code> በመንገድ ላይ ነው!</b> {fees} ለአድራሹ ያዘጋጁ።\n⏱ በ{min}–{max} ደቂቃ ውስጥ ይደርሳል።',
  },
  hlDone: {
    en: '<b>✅ Order <code>{id}</code> delivered.</b> Thank you! 💚',
    om: '<b>✅ Ajajni <code>{id}</code> isiniif geessameera.</b> Galatoomaa! 💚',
    am: '<b>✅ ትዕዛዝ <code>{id}</code> ደርሷል።</b> እናመሰግናለን! 💚',
  },

  // ---------- reviews ----------
  rateFood: {
    en: '⭐ How was the food from {merchant}? Tap to rate:',
    om: '⭐ Nyaanni {merchant} akkam ture? Sadarkaa kennuuf tuqaa:',
    am: '⭐ ከ{merchant} የመጣው ምግብ እንዴት ነበር? ደረጃ ለመስጠት ይንኩ፦',
  },
  rateRider: {
    en: '🚲 And the delivery by {rider}?',
    om: '🚲 Geejjibni {rider} hoo akkam ture?',
    am: '🚲 የ{rider} አደራረስስ እንዴት ነበር?',
  },
  btnThumbUp: { en: '👍 Good', om: '👍 Gaarii', am: '👍 ጥሩ' },
  btnThumbDown: { en: '👎 Bad', om: '👎 Gaarii miti', am: '👎 ጥሩ አይደለም' },
  askComment: {
    en: '✍️ Want to add a comment? Type it, or tap Skip.',
    om: '✍️ Yaada dabaluu barbaadduu? Barreessaa, ykn Darbi tuqaa.',
    am: '✍️ አስተያየት መጨመር ይፈልጋሉ? ይጻፉ፣ ወይም እለፍን ይንኩ።',
  },
  reviewThanks: {
    en: '💚 Thank you! Your review helps everyone in Shashe eat better.',
    om: '💚 Galatoomaa! Yaadni keessan namoota Shashee hunda ni gargaara.',
    am: '💚 እናመሰግናለን! አስተያየትዎ የሻሼን ሰው ሁሉ ይረዳል።',
  },
  alreadyReviewed: {
    en: 'You already rated this order.',
    om: 'Ajaja kanaaf duraan sadarkaa kennitaniittu.',
    am: 'ለዚህ ትዕዛዝ ቀድመው ደረጃ ሰጥተዋል።',
  },

  // ---------- merchant ----------
  mNewOrder: {
    en: '🔔 New order {id}\n\n{items}\n\nFood total: {food}\nCustomer area: {landmark}',
    om: '🔔 Ajaja haaraa {id}\n\n{items}\n\nWaliigala nyaataa: {food}\nNaannoo maamilaa: {landmark}',
    am: '🔔 አዲስ ትዕዛዝ {id}\n\n{items}\n\nየምግብ ድምር፦ {food}\nየደንበኛው አካባቢ፦ {landmark}',
  },
  mCustom: { en: 'Request', om: 'Gaaffii', am: 'ጥያቄ' },
  mPlusCustom: {
    en: '+ request (you set the final price)',
    om: '+ gaaffii (gatii dhumaa isin murteessitu)',
    am: '+ ጥያቄ (የመጨረሻውን ዋጋ እርስዎ ይወስናሉ)',
  },
  mPriceYou: { en: 'you set the price', om: 'gatii isin murteessitu', am: 'ዋጋውን እርስዎ ይወስናሉ' },
  mNewReview: {
    en: '⭐ New review for order {id}: {stars}\n{comment}',
    om: '⭐ Yaada haaraa ajaja {id}: {stars}\n{comment}',
    am: '⭐ ለትዕዛዝ {id} አዲስ አስተያየት፦ {stars}\n{comment}',
  },
  btnAccept: { en: '✅ Accept', om: '✅ Fudhadhu', am: '✅ ተቀበል' },
  btnReject: { en: '❌ Reject', om: '❌ Didi', am: '❌ አትቀበል' },
  mAskPrice: {
    en: '✍️ Order {id} has a special request. Send the FINAL food total in birr (numbers only, e.g. 450):',
    om: '✍️ Ajajni {id} gaaffii addaa qaba. Waliigala nyaataa DHUMAA birriin ergaa (lakkoofsa qofa, fkn. 450):',
    am: '✍️ ትዕዛዝ {id} ልዩ ጥያቄ አለው። የመጨረሻውን የምግብ ድምር በብር ይላኩ (ቁጥር ብቻ፣ ለምሳሌ 450)፦',
  },
  mBadPrice: {
    en: 'Please send numbers only, e.g. 450',
    om: 'Maaloo lakkoofsa qofa ergaa, fkn. 450',
    am: 'እባክዎ ቁጥር ብቻ ይላኩ፣ ለምሳሌ 450',
  },
  mAccepted: {
    en: '✅ Accepted. The customer will pay {food} to your account. I\'ll ask you to confirm when they send the reference.',
    om: '✅ Fudhatameera. Maamilli {food} herrega keessaniif kaffala. Yeroo ragaa ergan akka mirkaneessitan isin gaafadha.',
    am: '✅ ተቀብለዋል። ደንበኛው {food} ወደ ሂሳብዎ ይከፍላል። ማጣቀሻውን ሲልኩ እንዲያረጋግጡ እጠይቅዎታለሁ።',
  },
  mRejectedAck: { en: '❌ Rejected.', om: '❌ Didameera.', am: '❌ አልተቀበሉም።' },
  mCheckPayment: {
    en: '💰 Order {id}: the customer says they paid {food}.\nReference: {ref}\n\nCheck your Telebirr/CBE account, then tap:',
    om: '💰 Ajaja {id}: maamilli {food} kaffaleera jedha.\nRagaa: {ref}\n\nHerrega Telebirr/CBE keessan ilaalaatii tuqaa:',
    am: '💰 ትዕዛዝ {id}፦ ደንበኛው {food} እንደከፈለ ይናገራል።\nማጣቀሻ፦ {ref}\n\nየቴሌብር/CBE ሂሳብዎን አረጋግጠው ይንኩ፦',
  },
  btnPaid: { en: '✅ Money received', om: '✅ Maallaqni gaheera', am: '✅ ገንዘቡ ደርሷል' },
  btnNotPaid: { en: '❌ Not received', om: '❌ Hin geenye', am: '❌ አልደረሰም' },
  mStartPreparing: {
    en: '👨‍🍳 Start preparing order {id}. Tap when it is ready:',
    om: '👨‍🍳 Ajaja {id} qopheessuu jalqabaa. Yeroo qophaa\'u tuqaa:',
    am: '👨‍🍳 ትዕዛዝ {id}ን ማዘጋጀት ይጀምሩ። ሲዘጋጅ ይንኩ፦',
  },
  btnReady: { en: '📦 Ready for pickup', om: '📦 Fudhachuuf qophaa\'eera', am: '📦 ለመውሰድ ዝግጁ' },
  mReadyAck: { en: '📦 Marked ready.', om: '📦 Qophaa\'eera jedhameera.', am: '📦 ዝግጁ ተብሏል።' },
  mNotPaidAck: {
    en: 'OK. The customer was asked to check their payment.',
    om: 'Tole. Maamilli kaffaltii isaa akka ilaalu gaafatameera.',
    am: 'እሺ። ደንበኛው ክፍያውን እንዲያረጋግጥ ተጠይቋል።',
  },
  mRiderComing: {
    en: '🚲 Rider {rider} ({phone}) will pick up order {id}.',
    om: '🚲 Geessaan {rider} ({phone}) ajaja {id} ni fudhata.',
    am: '🚲 አድራሽ {rider} ({phone}) ትዕዛዝ {id}ን ይወስዳል።',
  },
  mPickedUp: { en: '✅ Order {id} picked up.', om: '✅ Ajajni {id} fudhatameera.', am: '✅ ትዕዛዝ {id} ተወስዷል።' },
  mCancelled: { en: '❌ Order {id} was cancelled.', om: '❌ Ajajni {id} haqameera.', am: '❌ ትዕዛዝ {id} ተሰርዟል።' },
  mDone: { en: '✅ Done', om: '✅ Xumurameera', am: '✅ ተጠናቋል' },

  // ---------- rider ----------
  rAssigned: {
    en: '🚲 You have order {id}\n\n📦 Pickup: {merchant} ({mphone})\n🏠 Drop: {landmark}{distance}\n👤 Customer: {cname} {cphone}\n\n💵 Collect {fees} cash from the customer.\nYour pay: {pay}',
    om: '🚲 Ajaja {id} qabdu\n\n📦 Fudhannaa: {merchant} ({mphone})\n🏠 Geessuu: {landmark}{distance}\n👤 Maamila: {cname} {cphone}\n\n💵 Maamila irraa {fees} maallaqa harkaa fudhadhaa.\nKaffaltii keessan: {pay}',
    am: '🚲 ትዕዛዝ {id} አለዎት\n\n📦 መውሰጃ፦ {merchant} ({mphone})\n🏠 ማድረሻ፦ {landmark}{distance}\n👤 ደንበኛ፦ {cname} {cphone}\n\n💵 ከደንበኛው {fees} በጥሬ ገንዘብ ይቀበሉ።\nክፍያዎ፦ {pay}',
  },
  btnPickedUp: { en: '📦 Picked up', om: '📦 Fudhadheera', am: '📦 ወስጃለሁ' },
  btnDelivered: { en: '✅ Delivered', om: '✅ Geesseera', am: '✅ አድርሻለሁ' },
  rReady: {
    en: '📦 Order {id} is ready at {merchant}. Go pick it up!',
    om: '📦 Ajajni {id} {merchant} biratti qophaa\'eera. Dhaqaa fudhadhaa!',
    am: '📦 ትዕዛዝ {id} {merchant} ዘንድ ዝግጁ ነው። ሄደው ይውሰዱ!',
  },
  rDeliveredAck: {
    en: '🎉 Great job! Order {id} delivered. Your pay: {pay}',
    om: '🎉 Baay\'ee gaarii! Ajajni {id} geessameera. Kaffaltii keessan: {pay}',
    am: '🎉 በጣም ጥሩ! ትዕዛዝ {id} ደርሷል። ክፍያዎ፦ {pay}',
  },
  rCancelled: {
    en: '❌ Order {id} was cancelled. Do not pick it up.',
    om: '❌ Ajajni {id} haqameera. Hin fudhatinaa.',
    am: '❌ ትዕዛዝ {id} ተሰርዟል። አይውሰዱት።',
  },
  rStartBot: {
    en: 'Open the bot in a private chat and press Start first, then try again.',
    om: 'Dura bot kana chaatii dhuunfaatti banaatii Start tuqaa, achiis irra deebi\'aa yaalaa.',
    am: 'መጀመሪያ ቦቱን በግል ውይይት ከፍተው Start ይጫኑ፣ ከዚያ እንደገና ይሞክሩ።',
  },
  rNotRider: {
    en: 'Only registered riders can take deliveries.',
    om: 'Geessitoota galmaa\'an qofatu ajaja fudhachuu danda\'a.',
    am: 'የተመዘገቡ አድራሾች ብቻ ናቸው ትዕዛዝ መውሰድ የሚችሉት።',
  },
  rTaken: {
    en: 'Someone already took this delivery.',
    om: 'Namni biraa ajaja kana fudhateera.',
    am: 'ሌላ ሰው ይህን ትዕዛዝ ወስዷል።',
  },
  notAllowed: {
    en: '⛔ You are not allowed to do this.',
    om: '⛔ Kana gochuuf hayyama hin qabdan.',
    am: '⛔ ይህን ለማድረግ ፈቃድ የለዎትም።',
  },
  alreadyDone: {
    en: 'This order was already updated.',
    om: 'Ajajni kun duraan haaromfameera.',
    am: 'ይህ ትዕዛዝ ቀድሞ ተዘምኗል።',
  },
  rOnTheWayAck: {
    en: '🚲 Ride safe! Tap Delivered when the customer has the order.',
    om: '🚲 Nagaan imalaa! Yeroo maamilli ajaja fudhatu Geesseera tuqaa.',
    am: '🚲 በሰላም ይንዱ! ደንበኛው ትዕዛዙን ሲቀበል አድርሻለሁ ይንኩ።',
  },
};

// Status names shown to customers
const STATUS_LABELS = {
  PLACED: { en: '⏳ Waiting for shop', om: '⏳ Suuqii eegaa', am: '⏳ ሱቁን በመጠበቅ ላይ' },
  ACCEPTED: { en: '💳 Waiting for your payment', om: '💳 Kaffaltii keessan eegaa', am: '💳 ክፍያዎን በመጠበቅ ላይ' },
  PAYMENT_SUBMITTED: { en: '🔎 Checking payment', om: '🔎 Kaffaltii ilaalaa', am: '🔎 ክፍያ በመረጋገጥ ላይ' },
  CONFIRMED: { en: '👨‍🍳 Preparing', om: '👨‍🍳 Qophaa\'aa jira', am: '👨‍🍳 በመዘጋጀት ላይ' },
  READY: { en: '📦 Ready for pickup', om: '📦 Fudhachuuf qophaa\'eera', am: '📦 ለመውሰድ ዝግጁ' },
  PICKED_UP: { en: '🚲 On the way', om: '🚲 Karaa irra', am: '🚲 በመንገድ ላይ' },
  DELIVERED: { en: '✅ Delivered', om: '✅ Geessameera', am: '✅ ደርሷል' },
  REJECTED: { en: '🚫 Rejected by shop', om: '🚫 Suuqiin dideera', am: '🚫 ሱቁ አልተቀበለም' },
  CANCELLED: { en: '❌ Cancelled', om: '❌ Haqameera', am: '❌ ተሰርዟል' },
};

export function normLang(lang) {
  return LANGS.includes(lang) ? lang : 'en';
}

export function t(lang, key, params = {}) {
  const entry = S[key];
  if (!entry) throw new Error(`Missing text key: ${key}`);
  const template = entry[normLang(lang)] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, k) => (params[k] == null ? '' : String(params[k])));
}

/** Same button text in every language: used to recognize reply-keyboard taps. */
export function allTexts(key) {
  return LANGS.map((l) => S[key][l]);
}

export function statusLabel(lang, status) {
  const e = STATUS_LABELS[status];
  return e ? e[normLang(lang)] : status;
}

export const _keys = Object.keys(S); // for tests
export const _strings = S;

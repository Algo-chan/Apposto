// All texts the bot shows to people. om = Afaan Oromoo, am = Amharic, en = English.
// ⚠️ Ask a native speaker to review the Oromo and Amharic before launch: just edit the strings.
// {placeholders} are filled in by the bot.

export const LANGS = ['om', 'am', 'en'];
export const LANG_LABELS = { om: 'Afaan Oromoo', am: 'አማርኛ', en: 'English' };

const S = {
  // ---------- customer ----------
  chooseLang: {
    en: 'Choose your language 👇',
    om: 'Afaan keessan filadhaa 👇',
    am: 'ቋንቋዎን ይምረጡ 👇',
  },
  welcome: {
    en: 'Welcome to {brand}! 🚲\nOrder from shops and restaurants in Shashamane, delivered by bicycle.',
    om: 'Baga gara {brand} dhuftan! 🚲\nSuuqiiwwanii fi mana nyaataa Shashamannee irraa ajajadhaa, saayikiliin isinii geessina.',
    am: 'እንኳን ወደ {brand} በደህና መጡ! 🚲\nከሻሸመኔ ሱቆችና ምግብ ቤቶች ይዘዙ፣ በብስክሌት እናደርስልዎታለን።',
  },
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
  menuHint: {
    en: 'Tap ➕ to add items.',
    om: 'Meeshaa dabaluuf ➕ tuqaa.',
    am: 'ዕቃ ለመጨመር ➕ ይንኩ።',
  },
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
  btnCheckout: { en: '✅ Checkout', om: '✅ Itti fufi', am: '✅ ቀጥል' },
  btnClear: { en: '🗑 Clear', om: '🗑 Haqi', am: '🗑 አጽዳ' },
  btnBack: { en: '⬅️ Back', om: '⬅️ Duubatti', am: '⬅️ ተመለስ' },
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
    en: '📍 Send your location so the rider can find you.\n(Turn on GPS, then tap the button below.)',
    om: '📍 Akka geessaan isin argatuuf bakka jirtan ergaa.\n(GPS banaatii button armaan gadii tuqaa.)',
    am: '📍 አድራሹ እንዲያገኝዎ አካባቢዎን ይላኩ።\n(GPS ያብሩና ከታች ያለውን ቁልፍ ይንኩ።)',
  },
  locDesktopHint: {
    en: '💻 On a computer? Paste a Google Maps link or coordinates (e.g. 7.2001, 38.5995), or tap Skip and the rider will call you.',
    om: '💻 Kompiitara irra jirtuu? Liinkii Google Maps ykn koordineetii (fkn. 7.2001, 38.5995) maxxansaa, ykn Darbi tuqaa geessaan isin bilbila.',
    am: '💻 በኮምፒውተር ነዎት? የGoogle Maps ሊንክ ወይም መጋጠሚያ (ለምሳሌ 7.2001, 38.5995) ይለጥፉ፣ ወይም እለፍን ይንኩ አድራሹ ይደውልልዎታል።',
  },
  btnShareLocation: { en: '📍 Send my location', om: '📍 Bakka koo ergi', am: '📍 አካባቢዬን ላክ' },
  btnSkip: { en: '⏭ Skip', om: '⏭ Darbi', am: '⏭ እለፍ' },
  outOfRange: {
    en: 'Sorry 🙏 you are about {km} km from the shop. For now we deliver up to {max} km.',
    om: 'Dhiifama 🙏 suuqii irraa gara km {km} fagaattu. Ammaaf hanga km {max} qofa geessina.',
    am: 'ይቅርታ 🙏 ከሱቁ {km} ኪ.ሜ ያህል ይርቃሉ። ለጊዜው እስከ {max} ኪ.ሜ ብቻ እናደርሳለን።',
  },
  askLandmark: {
    en: '🏠 Describe a landmark near you (e.g. "near Abyssinia Bank, blue gate").\n\n✍️ Just type your answer and send it.',
    om: '🏠 Mallattoo isinitti dhiyoo jiru ibsaa (fkn. "Baankii Abisiiniyaa bira, karra cuquliisa").\n\n✍️ Deebii keessan barreessaatii ergaa.',
    am: '🏠 በአቅራቢያዎ ያለ ምልክት ይግለጹ (ለምሳሌ "አቢሲንያ ባንክ አጠገብ፣ ሰማያዊ በር")።\n\n✍️ መልስዎን ይጻፉና ይላኩ።',
  },
  landmarkTooShort: {
    en: 'Please write a little more so the rider can find you.',
    om: 'Akka geessaan isin argatuuf maaloo xiqqoo dabalaa barreessaa.',
    am: 'አድራሹ እንዲያገኝዎ እባክዎ ትንሽ ተጨማሪ ይጻፉ።',
  },
  askPhone: {
    en: '📞 Send your phone number (tap the button or type it):',
    om: '📞 Lakkoofsa bilbilaa keessan ergaa (button tuqaa ykn barreessaa):',
    am: '📞 ስልክ ቁጥርዎን ይላኩ (ቁልፉን ይንኩ ወይም ይጻፉ)፦',
  },
  btnSharePhone: { en: '📞 Send my number', om: '📞 Lakkoofsa koo ergi', am: '📞 ቁጥሬን ላክ' },
  badPhone: {
    en: 'That number doesn\'t look right. Example: 0911234567',
    om: 'Lakkoofsi sun sirrii hin fakkaatu. Fakkeenya: 0911234567',
    am: 'ቁጥሩ ትክክል አይመስልም። ምሳሌ፦ 0911234567',
  },
  summaryTitle: { en: '🧾 Order summary', om: '🧾 Cuunfaa ajajaa', am: '🧾 የትዕዛዝ ማጠቃለያ' },
  deliveryFee: { en: 'Delivery', om: 'Geejjiba', am: 'ማድረሻ' },
  serviceFee: { en: 'Service fee', om: 'Kaffaltii tajaajilaa', am: 'የአገልግሎት ክፍያ' },
  location: { en: 'Location', om: 'Bakka', am: 'አካባቢ' },
  phone: { en: 'Phone', om: 'Bilbila', am: 'ስልክ' },
  howToPay: {
    en: '💳 Food is paid to the shop (Telebirr/CBE) after it accepts.\n🚲 Delivery + service fee is paid to the rider in cash.',
    om: '💳 Nyaanni erga suuqiin fudhatee booda suuqiif kaffalama (Telebirr/CBE).\n🚲 Geejjibaa fi tajaajila geessaaf maallaqa harkaan kaffalama.',
    am: '💳 ምግቡ ሱቁ ከተቀበለ በኋላ ለሱቁ ይከፈላል (ቴሌብር/CBE)።\n🚲 ማድረሻና አገልግሎት ክፍያ ለአድራሹ በጥሬ ገንዘብ ይከፈላል።',
  },
  btnConfirm: { en: '✅ Place order', om: '✅ Ajaja ergi', am: '✅ ትዕዛዝ ላክ' },
  btnCancel: { en: '❌ Cancel', om: '❌ Dhiisi', am: '❌ ሰርዝ' },
  orderPlaced: {
    en: '📨 Order {id} sent to {merchant}. Waiting for them to accept ⏳',
    om: '📨 Ajajni {id} gara {merchant} ergameera. Hanga fudhatanitti eegaa ⏳',
    am: '📨 ትዕዛዝ {id} ወደ {merchant} ተልኳል። እስኪቀበሉ ይጠብቁ ⏳',
  },
  orderCancelled: { en: 'Order {id} cancelled.', om: 'Ajajni {id} haqameera.', am: 'ትዕዛዝ {id} ተሰርዟል።' },
  cartCancelled: { en: 'Cancelled.', om: 'Dhiifameera.', am: 'ተሰርዟል።' },
  orderRejected: {
    en: 'Sorry 🙏 {merchant} can\'t take order {id} right now. Please try another shop.',
    om: 'Dhiifama 🙏 {merchant} amma ajaja {id} fudhachuu hin danda\'u. Maaloo suuqii biraa yaalaa.',
    am: 'ይቅርታ 🙏 {merchant} አሁን ትዕዛዝ {id}ን መቀበል አይችልም። እባክዎ ሌላ ሱቅ ይሞክሩ።',
  },
  payNow: {
    en: '✅ {merchant} accepted order {id}!\n\n1️⃣ Pay {food} to the shop:\n{accounts}\n\n2️⃣ Then send the transaction reference number here (e.g. CK12AB34CD).\n\n🚲 Pay {fees} (delivery + service) to the rider in cash when it arrives.',
    om: '✅ {merchant} ajaja {id} fudhateera!\n\n1️⃣ {food} suuqiif kaffalaa:\n{accounts}\n\n2️⃣ Achiis lakkoofsa ragaa kaffaltii (transaction reference) asitti ergaa (fkn. CK12AB34CD).\n\n🚲 Yeroo ajajni dhufu {fees} (geejjibaa fi tajaajila) geessaaf maallaqa harkaan kaffalaa.',
    am: '✅ {merchant} ትዕዛዝ {id}ን ተቀብሏል!\n\n1️⃣ {food} ለሱቁ ይክፈሉ፦\n{accounts}\n\n2️⃣ ከዚያ የግብይት ማጣቀሻ ቁጥሩን (transaction reference) እዚህ ይላኩ (ለምሳሌ CK12AB34CD)።\n\n🚲 ትዕዛዙ ሲደርስ {fees} (ማድረሻና አገልግሎት) ለአድራሹ በጥሬ ገንዘብ ይክፈሉ።',
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
    en: 'Got it ✅ The shop is checking your payment.',
    om: 'Argameera ✅ Suuqiin kaffaltii keessan ilaalaa jira.',
    am: 'ደርሶናል ✅ ሱቁ ክፍያዎን እያረጋገጠ ነው።',
  },
  payConfirmed: {
    en: '💚 Payment confirmed! Your order {id} is being prepared.',
    om: '💚 Kaffaltiin mirkanaa\'eera! Ajajni {id} keessan qophaa\'aa jira.',
    am: '💚 ክፍያዎ ተረጋግጧል! ትዕዛዝ {id} እየተዘጋጀ ነው።',
  },
  payNotFound: {
    en: '⚠️ The shop could not find your payment for order {id}. Please check and send the correct reference number.',
    om: '⚠️ Suuqiin kaffaltii ajaja {id} hin arganne. Maaloo ilaalaatii lakkoofsa ragaa sirrii ergaa.',
    am: '⚠️ ሱቁ ለትዕዛዝ {id} ክፍያዎን አላገኘም። እባክዎ አረጋግጠው ትክክለኛውን የማጣቀሻ ቁጥር ይላኩ።',
  },
  riderAssigned: {
    en: '🚲 {rider} will deliver order {id}. Phone: {phone}',
    om: '🚲 {rider} ajaja {id} isinii geessa. Bilbila: {phone}',
    am: '🚲 {rider} ትዕዛዝ {id}ን ያደርስልዎታል። ስልክ፦ {phone}',
  },
  pickedUp: {
    en: '🚲 Order {id} is on the way! Have {fees} ready for the rider.',
    om: '🚲 Ajajni {id} karaa irra jira! {fees} geessaaf qopheessaa.',
    am: '🚲 ትዕዛዝ {id} በመንገድ ላይ ነው! {fees} ለአድራሹ ያዘጋጁ።',
  },
  delivered: {
    en: '✅ Order {id} delivered. Thank you! 💚',
    om: '✅ Ajajni {id} isiniif geessameera. Galatoomaa! 💚',
    am: '✅ ትዕዛዝ {id} ደርሷል። እናመሰግናለን! 💚',
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
  etaConfirmed: {
    en: '🕒 Estimated arrival: in about {min}–{max} min',
    om: '🕒 Gahiinsa tilmaamame: daqiiqaa {min}–{max} keessatti',
    am: '🕒 የሚደርስበት ግምት፦ በ{min}–{max} ደቂቃ ውስጥ',
  },
  etaOnTheWay: {
    en: '⏱ Arriving in about {min}–{max} min.',
    om: '⏱ Daqiiqaa {min}–{max} keessatti ni gaha.',
    am: '⏱ በ{min}–{max} ደቂቃ ውስጥ ይደርሳል።',
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

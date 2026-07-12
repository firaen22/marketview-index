// Curated financial-jargon glossary for the live markets presentation.
//
// PURPOSE — stop the AI from explaining terms wrongly on screen. When the model
// returns a term that MATCHES an entry here AND that entry has a vetted
// explanation for the current language, the model's explanation is REPLACED with
// the house-approved text verbatim (see overrideExplanations). The model still
// handles the long tail of terms not listed here.
//
// The wording below was drafted by agy (the richer variant), cross-checked
// against codex, and approved. To edit:
//  - Change `en` / `zh-TW` freely; keep it short — it renders on a 720p projector.
//  - An EMPTY string ('') is IGNORED for that language, so the AI's own
//    explanation is used until you fill it in. Blank entries are safe to ship.
//  - `aliases` = every surface form that should map to this entry, across
//    languages and abbreviations (e.g. 'bps', 'basis point', '基點'). Matching is
//    case-insensitive and ignores surrounding brackets / punctuation / spaces.

export interface GlossaryEntry {
    aliases: string[];
    explanation: {
        en: string;
        'zh-TW': string;
    };
}

export const JARGON_GLOSSARY: GlossaryEntry[] = [
    { aliases: ["money market fund", "mmf", "貨幣市場基金"], explanation: { en: "A low-risk fund investing in short-term debt, acting like a bank savings account but with slightly higher potential returns and no guaranteed insurance.", 'zh-TW': "一種低風險基金，投資於短期債務，類似銀行儲蓄戶口，但回報可能略高且不設存款保障。" } },
    { aliases: ["accumulating", "accumulation", "acc", "累積", "累積類別"], explanation: { en: "A fund option that automatically reinvests any dividends or interest earned back into the fund to buy more shares, rather than paying cash to you.", 'zh-TW': "基金將賺取的股息或利息自動重新投資以買入更多基金單位，而非向您派發現金。" } },
    { aliases: ["distributing", "distribution", "dist", "派息", "分派", "派息類別"], explanation: { en: "A fund option that pays out the interest or dividends it earns directly to you as cash, usually monthly, quarterly, or annually.", 'zh-TW': "基金定期（如每月或每季）將賺取的利息或股息，以現金形式直接派發給投資者。" } },
    { aliases: ["share class", "class a", "a class", "a類別", "a 類別", "類別"], explanation: { en: "Different versions of the same fund, packaged with different fees or minimum investments, though they all invest in the exact same pool of assets.", 'zh-TW': "同一隻基金的不同版本（如A類或I類），投資於相同資產，但收費或最低投資額不同。" } },
    { aliases: ["nav", "net asset value", "資產淨值", "每單位資產淨值"], explanation: { en: "The price of a single share in a fund, calculated by dividing the fund's total net assets by the number of outstanding shares.", 'zh-TW': "基金每單位的價格，由基金總資產扣除負債後，除以發行在外的總單位數求得。" } },
    { aliases: ["management fee", "管理費"], explanation: { en: "A yearly fee paid to the fund managers for running the fund, usually charged as a percentage (like 1%) of your total investment.", 'zh-TW': "支付給基金經理的管理服務年費，通常按投資總額的某個百分比（如1%）計算。" } },
    { aliases: ["expense ratio", "ongoing charges", "ter", "費用比率", "經常性開支"], explanation: { en: "The total annual cost of owning a fund, including management and administrative fees, expressed as a percentage of your investment (e.g., 1.5% per year).", 'zh-TW': "營運基金的年度總成本（包括管理和行政費），佔投資額的百分比（如每年1.5%）。" } },
    { aliases: ["subscription", "認購", "申購"], explanation: { en: "The process of buying new shares or units in an investment fund.", 'zh-TW': "投資者投入資金以買入基金新單位的過程。" } },
    { aliases: ["redemption", "贖回"], explanation: { en: "Selling your fund units back to the fund provider to get your cash back.", 'zh-TW': "投資者將持有的基金單位賣回給基金公司，以取回現金。" } },
    { aliases: ["aum", "assets under management", "資產管理規模", "管理資產"], explanation: { en: "The total market value of all the money and assets managed by a financial institution or fund.", 'zh-TW': "某基金或金融機構代投資者管理的所有資產之總市場價值。" } },
    { aliases: ["duration", "存續期", "久期"], explanation: { en: "A measure of how much a bond's price falls when interest rates rise. If duration is 5 years, a 1% rate rise drops price by about 5%.", 'zh-TW': "衡量債券價格對利率變動的敏感度。若存續期為5年，利率上升1%時債券價格約下跌5%。" } },
    { aliases: ["modified duration", "修正存續期"], explanation: { en: "The exact percentage a bond's price changes for every 1% move in interest rates.", 'zh-TW': "利率每變動1%時，債券價格預期變動的精確百分比。" } },
    { aliases: ["yield to maturity", "ytm", "到期收益率", "到期殖利率"], explanation: { en: "The total annual return you will get if you buy a bond today and hold it until it is paid back, assuming all payments are made.", 'zh-TW': "若今天買入債券並持有至到期日，在發行人沒有違約下，預期獲得的平均年化回報率。" } },
    { aliases: ["coupon", "coupon rate", "票息", "票面利率"], explanation: { en: "The regular interest payment a bond issuer pays to the bondholder, usually a fixed annual percentage of the bond's original value.", 'zh-TW': "債券發行人定期支付給持有人的固定利息，按債券面值的年利率計算。" } },
    { aliases: ["basis point", "basis points", "bp", "bps", "基點", "個基點"], explanation: { en: "A financial unit of measure equal to 1/100th of 1% (0.01%). For example, a 50 basis point rate cut means interest rates drop by 0.50%.", 'zh-TW': "金融計量單位，等於百分之零點零一（0.01%）。例如減息50個基點即減息0.5%。" } },
    { aliases: ["credit spread", "spread", "信用利差", "息差", "利差"], explanation: { en: "The extra yield a risky bond pays compared to a safe government bond of the same maturity, compensating investors for taking default risk.", 'zh-TW': "風險債券與同期限安全國債之間的收益率差距，用作補償投資者承擔的違約風險。" } },
    { aliases: ["investment grade", "ig", "投資級", "投資級別"], explanation: { en: "Bonds rated BBB- or higher, indicating a low risk of the issuer defaulting on its payments, making them relatively safe investments.", 'zh-TW': "評級在BBB-或以上的債券，代表發行人違約風險較低，屬於較安全的投資。" } },
    { aliases: ["high yield", "junk bond", "non-investment grade", "高收益", "非投資級"], explanation: { en: "Bonds with lower credit ratings (below BBB-) that pay higher interest to compensate for a higher risk of default. Often called junk bonds.", 'zh-TW': "評級較低（BBB-以下）的債券，因違約風險較高，故需支付較高利息吸引投資者。" } },
    { aliases: ["yield curve", "收益率曲線", "殖利率曲線"], explanation: { en: "A line showing the interest rates of bonds with different maturities. Typically, longer-term bonds pay higher rates than short-term bonds.", 'zh-TW': "顯示不同期限債券收益率關係的曲線。通常期限越長，收益率越高。" } },
    { aliases: ["maturity", "到期", "到期日"], explanation: { en: "The specific date when a bond ends and the issuer must pay back the original borrowed amount to the investor.", 'zh-TW': "債券合約結束的日期，屆時發行人必須向投資者全數歸還借入的本金。" } },
    { aliases: ["credit rating", "信用評級", "信貸評級"], explanation: { en: "An assessment of a borrower's ability to pay back debt, given by agencies like S&P (e.g., AAA is safest, D means already defaulted).", 'zh-TW': "評級機構對債務人還款能力的評估（如AAA級最安全，D級代表已違約）。" } },
    { aliases: ["p/e ratio", "pe ratio", "price-to-earnings", "pe", "市盈率", "本益比"], explanation: { en: "A stock's price divided by its earnings per share. A P/E of 15 means you pay $15 for every $1 of annual profit.", 'zh-TW': "股票價格除以每股盈利。市盈率15倍代表您為企業每1元的年利潤支付15元。" } },
    { aliases: ["eps", "earnings per share", "每股盈利", "每股盈餘"], explanation: { en: "A company's total profit divided by its number of shares. It shows how much profit is allocated to each share of stock.", 'zh-TW': "企業總利潤除以發行在外的股票總數，代表每股股票所分攤到的淨利潤。" } },
    { aliases: ["ebitda", "稅息折舊及攤銷前利潤"], explanation: { en: "A measure of a company's core operating profitability, before interest, taxes, depreciation, and amortization.", 'zh-TW': "扣除利息、稅項、折舊及攤銷前的企業利潤，反映其核心業務的賺錢能力。" } },
    { aliases: ["dividend yield", "股息率", "股息收益率"], explanation: { en: "A ratio showing how much a company pays out in dividends each year relative to its stock price. A 4% yield means $4 per $100 stock.", 'zh-TW': "年度每股股息除以股價。如股息率是4%，代表持有一百元股票每年可收四元股息。" } },
    { aliases: ["market cap", "market capitalization", "market capitalisation", "市值", "市場資本"], explanation: { en: "The total dollar value of a company's outstanding shares. A company with 1 million shares priced at $50 has a $50 million market cap.", 'zh-TW': "公司所有發行在外股票的總價值。如有一百萬股，每股五十元，市值即五千萬元。" } },
    { aliases: ["free cash flow", "fcf", "自由現金流"], explanation: { en: "The cash a company has left over after paying for its operating expenses and major equipment upgrades, ready to be returned to investors.", 'zh-TW': "企業扣除營運開支及購買設備等資本開支後，剩下可自由分配給股東的現金。" } },
    { aliases: ["federal funds rate", "fed funds rate", "policy rate", "聯邦基金利率", "政策利率"], explanation: { en: "The target interest rate set by the US central bank at which commercial banks lend to each other overnight, influencing global borrowing costs.", 'zh-TW': "美國聯邦儲備局設定的基準利率，決定商業銀行之間的隔夜借貸成本，影響全球息率。" } },
    { aliases: ["inflation", "cpi", "consumer price index", "通脹", "通膨", "消費者物價指數"], explanation: { en: "The general rise in prices over time, which reduces the purchasing power of money. A 3% inflation rate means a $100 item costs $103 next year.", 'zh-TW': "物價隨時間持續上升的現象，會令貨幣購買力下降。通脹率3%即今年百元商品明年賣百三元。" } },
    { aliases: ["gdp", "gross domestic product", "國內生產總值", "本地生產總值"], explanation: { en: "The total monetary value of all finished goods and services produced within a country over a specific period, measuring the economy's size.", 'zh-TW': "一國在特定時期內生產的所有最終商品和服務的總價值，用以衡量經濟規模。" } },
    { aliases: ["hawkish", "鷹派"], explanation: { en: "A central bank policy stance favoring higher interest rates to combat inflation, even if it slows down economic growth.", 'zh-TW': "央行傾向提高利率以抑制通脹的立場，即使這可能會拖慢經濟增長步伐。" } },
    { aliases: ["dovish", "鴿派"], explanation: { en: "A central bank policy stance favoring lower interest rates to encourage economic growth and job creation, tolerating higher inflation.", 'zh-TW': "央行傾向降低利率以刺激經濟和就業的立場，對通脹的容忍度通常較高。" } },
    { aliases: ["soft landing", "軟著陸"], explanation: { en: "A central bank successfully raising interest rates to slow inflation without causing a recession or high unemployment.", 'zh-TW': "央行提高利率成功抑制通脹，同時避免經濟陷入衰退或導致失業率飆升。" } },
    { aliases: ["contango", "期貨溢價", "正價差"], explanation: { en: "A situation where futures prices are higher than the current spot price, often due to costs like storage and insurance over time.", 'zh-TW': "期貨價格高於現貨價格的情況，通常因為持有合約至到期需要支付倉儲和保險成本。" } },
    { aliases: ["backwardation", "期貨貼水", "逆價差"], explanation: { en: "A situation where futures prices are lower than the current spot price, usually indicating high immediate demand or supply shortages.", 'zh-TW': "期貨價格低於現貨價格的情況，通常反映市場對現貨的即時需求非常急切或供應短缺。" } },
    { aliases: ["volatility", "vol", "波動率", "波幅"], explanation: { en: "A measure of how much and how quickly an asset's price swings up and down over a period of time.", 'zh-TW': "衡量資產價格在一段時間內上下波動幅度和速度的指標。" } },
    { aliases: ["hedging", "hedge", "對沖", "避險"], explanation: { en: "Taking an opposing investment position to reduce the risk of price losses in an existing asset, like buying insurance for your portfolio.", 'zh-TW': "透過進行相反方向的投資來降低現有資產價格波動風險的策略，如同為投資買保險。" } },
    { aliases: ["leverage", "gearing", "槓桿"], explanation: { en: "Using borrowed money to increase the potential return of an investment, which also increases the risk of bigger losses.", 'zh-TW': "利用借入的資金來放大投資的潛在回報，但同時亦會按比例放大潛在的虧損風險。" } },
    { aliases: ["liquidity", "流動性", "流通性"], explanation: { en: "How quickly and easily you can buy or sell an asset in the market and turn it into cash without affecting its price.", 'zh-TW': "資產在市場上變現的難易及快捷程度，且不會對其市場價格造成重大影響。" } },
    { aliases: ["diversification", "分散投資", "多元化"], explanation: { en: "Spreading investments across different assets (like stocks, bonds, and real estate) to reduce risk — not putting all eggs in one basket.", 'zh-TW': "將資金分配到不同的資產類別以降低整體風險，俗稱「不要把所有雞蛋放在同一個籃子裡」。" } },
];

// Match key: lower-case, whitespace-collapsed, and stripped of the brackets and
// punctuation that models sprinkle around terms (e.g. "A類別（累積）", "bps.").
// Chinese characters are unaffected by lower-casing.
export function normalizeTerm(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[()（）[\]【】「」.,、，。：:;；]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function buildGlossaryLookup(entries: GlossaryEntry[]): Map<string, GlossaryEntry> {
    const lookup = new Map<string, GlossaryEntry>();
    for (const entry of entries) {
        for (const alias of entry.aliases) {
            const key = normalizeTerm(alias);
            // First alias wins on collision — keeps behaviour deterministic if two
            // entries accidentally share a surface form.
            if (key && !lookup.has(key)) lookup.set(key, entry);
        }
    }
    return lookup;
}

// Returns the vetted explanation for a term in the requested language, or null
// when the term is unknown OR its explanation for that language is still blank.
export function lookupExplanation(
    term: string,
    lang: 'en' | 'zh-TW',
    lookup: Map<string, GlossaryEntry>,
): string | null {
    const entry = lookup.get(normalizeTerm(term));
    if (!entry) return null;
    const vetted = entry.explanation[lang]?.trim();
    return vetted ? vetted : null;
}

// Deterministic override: replace the explanation of any term that has a vetted
// glossary entry for `lang`. Terms without a (filled) entry pass through
// untouched, so the model's own explanation is kept for everything else.
export function overrideExplanations<T extends { term: string; explanation: string }>(
    terms: T[],
    lang: 'en' | 'zh-TW',
    lookup: Map<string, GlossaryEntry>,
): T[] {
    return terms.map(item => {
        const vetted = lookupExplanation(item.term, lang, lookup);
        return vetted ? { ...item, explanation: vetted } : item;
    });
}

const DEFAULT_LOOKUP = buildGlossaryLookup(JARGON_GLOSSARY);

// Production convenience wrapper bound to the real glossary above.
export function applyGlossaryOverride<T extends { term: string; explanation: string }>(
    terms: T[],
    lang: 'en' | 'zh-TW',
): T[] {
    return overrideExplanations(terms, lang, DEFAULT_LOOKUP);
}

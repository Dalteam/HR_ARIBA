// The salary calculator's figures, handed to the templates page's job-offer card — the updated design's lib/offerDraft.js
// (a module object), kept here in sessionStorage instead because a module value may not be written from a component
// (our compiler lint) and because this way the figures also survive a reload. Two slots as in the design:
// `putOfferFigures` is what «إنشاء عرض وظيفي بهذه الأرقام» leaves for the templates page to take once, and
// `putLastOffer` is the latest result, read by «جلب من حاسبة الراتب» at any time. Nothing is sent to the server.

export interface OfferFigures {
  basic: number;
  housing: number;
  transport: number;
  project: number;
  other: number;
  /** the name HR typed for the "other" allowance, shown instead of «بدلات أخرى» in the letter */
  otherLabel?: string;
}

const DATA = "ariba_offer_data1";
/** what the card takes once */
const LAST = "ariba_offer_last1";

const read = (k: string): OfferFigures | null => {
  try {
    const o = JSON.parse(sessionStorage.getItem(k) || "null");
    return o && typeof o === "object" ? (o as OfferFigures) : null;
  } catch {
    return null;
  }
};
const write = (k: string, f: OfferFigures) => {
  try {
    sessionStorage.setItem(k, JSON.stringify(f));
  } catch {
    /* private mode / quota — the card simply opens empty */
  }
};

/** «إنشاء عرض وظيفي بهذه الأرقام»: leave the calculator's components for the job-offer card. */
export const putOfferFigures = (f: OfferFigures) => write(DATA, f);
/** The job-offer card takes them on arrival and clears them (the design's `offerDraft.data = null`). */
export function takeOfferFigures(): OfferFigures | null {
  const f = read(DATA);
  try {
    sessionStorage.removeItem(DATA);
  } catch {
    /* ignore */
  }
  return f;
}
/** The calculator's latest result, for the card's «جلب من حاسبة الراتب» (the design's `offerDraft.last`). */
export const putLastOffer = (f: OfferFigures) => write(LAST, f);
export const getLastOffer = (): OfferFigures | null => read(LAST);

// src/lib/schema.ts
import { z } from "zod";

/** ======= Scope: 3 states only (NY, CA, OH) ======= */
export const States = ["NY", "CA", "OH"] as const;

export const CitiesByState: Record<(typeof States)[number], readonly string[]> =
  {
    NY: ["New York City", "Buffalo", "Rochester", "Yonkers", "Syracuse"],
    CA: ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento"],
    OH: ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron"],
  };

/** ======= Reference enums ======= */
export const LocationTypes = ["store", "office", "warehouse", "home"] as const;
export const RevenueBands = ["<100k", "100k-1M", "1M-5M", ">=5M"] as const;
export const LegalStructures = [
  "LLC",
  "Corp",
  "S-Corp",
  "SoleProp",
  "Nonprofit",
] as const;
export const AlcoholTypes = ["beer", "wine", "spirits"] as const;
export const PayrollFreq = [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
] as const;
export const DataVolumeBands = ["<50k", "50k-100k", ">=100k"] as const;

/** Nuance enums */
export const AlcoholSalesContext = [
  "on-premise",
  "off-premise",
  "both",
] as const;
export const MinorsAges = ["<16", "16-17"] as const;
export const TippedPercentBand = ["<20%", "20-50%", ">50%"] as const;
export const NumLocations = ["1", "2-4", "5+"] as const;

/** ======= Helpers ======= */
const intNonNegative = z.coerce
  .number()
  .int()
  .min(0, { message: "Must be 0 or more" });

const optionalDateStr = z
  .preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  )
  .optional();

const optionalTrimmed = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1))
  .optional();

/** NAICS inputs */
const naicsCode = z
  .preprocess(
    (v) => (v === "" || v == null ? undefined : String(v).trim()),
    z.string().regex(/^\d{2,6}$/, "2–6 digit NAICS")
  )
  .optional();
const naicsTitle = optionalTrimmed;

/** ZIP (optional but validated if present) */
const zipOptional = z
  .preprocess(
    (v) => (v === "" || v == null ? undefined : String(v).trim()),
    z.string().regex(/^\d{5}(-\d{4})?$/, "Use 12345 or 12345-6789")
  )
  .optional();

/** ======= The main form schema ======= */
export const BusinessFormSchema = z
  .object({
    // 1) Basics
    businessName: z.string().min(1, "Business name is required"),
    industry: z.string().min(1, "Industry is required"),
    state: z.enum(States),
    city: z.string().min(1, "City is required"),
    county: optionalTrimmed,
    zip: zipOptional,
    naicsCode,
    naicsTitle,
    employeesTotal: intNonNegative,
    numLocations: z.enum(NumLocations).optional(),

    businessStartDate: optionalDateStr,
    firstEmployeeHireDate: optionalDateStr,

    // 2) Footprint & location
    hasPhysicalLocation: z.boolean().default(false),
    publicFacingPremises: z.boolean().default(false),
    locationType: z.enum(LocationTypes).optional(),
    multiState: z.boolean().default(false),
    otherStates: z.array(z.enum(States)).default([]),
    hasRemoteEmployees: z.boolean().default(false),
    remoteEmployeeStates: z.array(z.enum(States)).default([]),

    // 3) Operations & workforce
    handlesFood: z.boolean().default(false),
    sellsAlcohol: z.boolean().default(false),
    hazardousMaterials: z.boolean().default(false),
    commercialVehicles: z.boolean().default(false),
    hasCDLDrivers: z.boolean().default(false),
    acceptsCardPayments: z.boolean().default(false),
    collectsCustomerData: z.boolean().default(false),

    // Workforce nuance
    tippedWorkers: z.boolean().default(false),
    tippedPercentBand: z.enum(TippedPercentBand).optional(),
    employsMinors: z.boolean().default(false),
    minorsAges: z.array(z.enum(MinorsAges)).default([]),
    usesContractors1099: z.boolean().default(false),

    // 4) Licensing & taxes
    sellsTaxable: z.boolean().default(false),
    salesStates: z.array(z.enum(States)).default([]),
    onlineOnly: z.boolean().default(false),
    onlineMarketplace: z.boolean().default(false),
    revenueBand: z.enum(RevenueBands).optional(),
    legalStructure: z.enum(LegalStructures).optional(),
    hasEIN: z.boolean().default(false),

    // 5) Food & alcohol nuance
    onSitePrep: z.boolean().default(false),
    seatingOnPrem: z.boolean().default(false),
    meatDairy: z.boolean().default(false),
    alcoholType: z.enum(AlcoholTypes).optional(),
    alcoholSalesContext: z.enum(AlcoholSalesContext).optional(),
    serverTrainingPlanned: z.boolean().default(false),

    // 6) Privacy
    handlesPHI: z.boolean().default(false),
    childrenUnder13: z.boolean().default(false),
    collectsFromCA: z.boolean().default(false),
    collectsFromOtherStates: z.array(z.enum(States)).default([]),
    dataVolumeBand: z.enum(DataVolumeBands).optional(),
    sellsOrSharesData: z.boolean().default(false),
    usesBiometrics: z.boolean().default(false),

    // 7) Safety & environment
    usesRefrigerants: z.boolean().default(false),
    usesSolvents: z.boolean().default(false),
    trucksOver10kInterstate: z.boolean().default(false),
    usesForklifts: z.boolean().default(false),

    // 8) Facilities & digital
    publicFacingSite: z.boolean().default(false),
    hasWebsiteOrApp: z.boolean().default(false),

    // 9) HR & benefits
    payrollFrequency: z.enum(PayrollFreq).optional(),
    offersHealth: z.boolean().default(false),
    offers401k: z.boolean().default(false),
    usesPEO: z.boolean().default(false),

    // 10) Trigger dates
    firstSaleDate: optionalDateStr,
    firstPayrollDate: optionalDateStr,
    leaseDate: optionalDateStr,
  })
  .refine((v) => !v.multiState || v.otherStates.length > 0, {
    path: ["otherStates"],
    message: "Select at least one state",
  })
  .refine((v) => !v.hasRemoteEmployees || v.remoteEmployeeStates.length > 0, {
    path: ["remoteEmployeeStates"],
    message: "Select at least one state",
  })
  .refine((v) => !v.sellsTaxable || v.salesStates.length > 0, {
    path: ["salesStates"],
    message: "Select states where you make sales",
  })
  .refine((v) => !v.tippedWorkers || !!v.tippedPercentBand, {
    path: ["tippedPercentBand"],
    message: "Select an approximate share of tipped workers",
  })
  .refine((v) => !v.employsMinors || v.minorsAges.length > 0, {
    path: ["minorsAges"],
    message: "Select the ages of minors you employ",
  })
  .refine(
    (v) => !v.commercialVehicles || typeof v.hasCDLDrivers === "boolean",
    {
      path: ["hasCDLDrivers"],
      message: "Indicate whether any drivers require a CDL",
    }
  )
  .refine((v) => !v.sellsAlcohol || !!v.alcoholSalesContext, {
    path: ["alcoholSalesContext"],
    message: "Select where alcohol is sold (on/off/both)",
  });

export type BusinessForm = z.infer<typeof BusinessFormSchema>;
export type Payload = BusinessForm;

export const defaultBusinessForm: BusinessForm = {
  businessName: "",
  industry: "Restaurant",
  state: "NY",
  city: "",
  county: undefined,
  zip: undefined,
  naicsCode: undefined,
  naicsTitle: undefined,
  employeesTotal: 0,
  numLocations: undefined,

  businessStartDate: undefined,
  firstEmployeeHireDate: undefined,

  hasPhysicalLocation: true,
  publicFacingPremises: false,
  locationType: "store",
  multiState: false,
  otherStates: [],
  hasRemoteEmployees: false,
  remoteEmployeeStates: [],

  handlesFood: false,
  sellsAlcohol: false,
  hazardousMaterials: false,
  commercialVehicles: false,
  hasCDLDrivers: false,
  acceptsCardPayments: false,
  collectsCustomerData: false,

  tippedWorkers: false,
  tippedPercentBand: undefined,
  employsMinors: false,
  minorsAges: [],

  usesContractors1099: false,

  sellsTaxable: false,
  salesStates: [],
  onlineOnly: false,
  onlineMarketplace: false,
  revenueBand: undefined,
  legalStructure: "LLC",
  hasEIN: false,

  onSitePrep: false,
  seatingOnPrem: false,
  meatDairy: false,
  alcoholType: undefined,
  alcoholSalesContext: undefined,
  serverTrainingPlanned: false,

  handlesPHI: false,
  childrenUnder13: false,
  collectsFromCA: false,
  collectsFromOtherStates: [],
  dataVolumeBand: undefined,
  sellsOrSharesData: false,
  usesBiometrics: false,

  usesRefrigerants: false,
  usesSolvents: false,
  trucksOver10kInterstate: false,
  usesForklifts: false,

  publicFacingSite: false,
  hasWebsiteOrApp: false,

  payrollFrequency: undefined,
  offersHealth: false,
  offers401k: false,
  usesPEO: false,

  firstSaleDate: undefined,
  firstPayrollDate: undefined,
  leaseDate: undefined,
};

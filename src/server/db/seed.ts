import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { hmacHash } from "@/lib/crypto";
import { TERMS_VERSION } from "@/lib/constants";
import { getDb, getSql } from "./client";
import {
  account,
  catalogueParts,
  customers,
  employerEligibleEmployees,
  employerSchemes,
  employers,
  garages,
  lenders,
  lenderUsers,
  productDocumentRequirements,
  products,
  serviceCatalogue,
  settings,
  staffProfiles,
  user,
} from "./schema";

const DEV_SEED_PASSWORD = "AskAutoParts2026!";

async function ensureUser(params: {
  email: string;
  name: string;
  phoneNumber: string;
  kind: "customer" | "staff" | "lender";
  passwordHash: string;
  twoFactorEnabled?: boolean;
}) {
  const db = getDb();
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, params.email.toLowerCase()))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const userId = uuidv7();
  const now = new Date();
  const [created] = await db
    .insert(user)
    .values({
      id: userId,
      name: params.name,
      email: params.email.toLowerCase(),
      emailVerified: true,
      phoneNumber: params.phoneNumber,
      phoneNumberVerified: true,
      twoFactorEnabled: params.twoFactorEnabled ?? false,
      kind: params.kind,
      status: "active",
      locale: "en",
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: now,
    })
    .returning();

  await db.insert(account).values({
    id: uuidv7(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: params.passwordHash,
  });

  return created;
}

export async function runSeed() {
  const db = getDb();
  const passwordHash = await hashPassword(DEV_SEED_PASSWORD);

  // 1. Settings
  const defaultSettings: Array<{ key: string; value: unknown }> = [
    { key: "inspection_fee_kes", value: 1500 },
    { key: "scope_variance_pct", value: 10 },
    { key: "otp_ttl_seconds", value: 300 },
    { key: "reset_token_ttl_minutes", value: 30 },
    { key: "non_eligible_platform_fallback", value: "CASH_ROUTE" },
    {
      key: "daily_estimate_config",
      value: {
        defaultAssumedRepairKes: 20000,
        assumedTenorDays: 60,
        assumedFactor: 1.272,
      },
    },
    { key: "review_sla_hours", value: 8 },
    { key: "reschedule_min_hours_before", value: 4 },
    {
      key: "holidays",
      value: [
        "2026-01-01",
        "2026-04-03",
        "2026-04-06",
        "2026-05-01",
        "2026-06-01",
        "2026-10-10",
        "2026-10-20",
        "2026-12-12",
        "2026-12-25",
        "2026-12-26",
      ],
    },
  ];

  for (const item of defaultSettings) {
    await db
      .insert(settings)
      .values(item)
      .onConflictDoNothing({ target: settings.key });
  }

  // 2. Lenders
  await db
    .insert(lenders)
    .values([
      {
        name: "Fund Flow Capital",
        code: "FUND_FLOW",
        contactEmail: "underwriting@fundflow.example",
        status: "active",
        slaHours: 8,
      },
      {
        name: "UMBA Microfinance Bank",
        code: "UMBA",
        contactEmail: "credit@umba.example",
        status: "active",
        slaHours: 8,
      },
    ])
    .onConflictDoNothing({ target: lenders.code });

  const [fundFlow] = await db.select().from(lenders).where(eq(lenders.code, "FUND_FLOW")).limit(1);
  const [umba] = await db.select().from(lenders).where(eq(lenders.code, "UMBA")).limit(1);

  if (!fundFlow || !umba) {
    throw new Error("Failed to seed lenders");
  }

  // 3. Products
  await db
    .insert(products)
    .values([
      {
        code: "RIDE_HAILING",
        name: "Ride-Hailing Drivers",
        repaymentFrequency: "daily",
        lenderMode: "fixed",
        fixedLenderId: fundFlow.id,
        active: true,
      },
      {
        code: "SALARIED",
        name: "Salaried Scheme Employees",
        repaymentFrequency: "monthly",
        lenderMode: "by_scheme",
        fixedLenderId: null,
        active: true,
      },
    ])
    .onConflictDoNothing({ target: products.code });

  // 4. Product document requirements
  const docRequirements: Array<{
    productCode: "RIDE_HAILING" | "SALARIED";
    docType: (typeof productDocumentRequirements.$inferInsert)["docType"];
    required: boolean;
    uploadedBy: "customer" | "ops";
    sort: number;
  }> = [
    { productCode: "RIDE_HAILING", docType: "national_id_front", required: true, uploadedBy: "customer", sort: 1 },
    { productCode: "RIDE_HAILING", docType: "national_id_back", required: true, uploadedBy: "customer", sort: 2 },
    { productCode: "RIDE_HAILING", docType: "selfie", required: true, uploadedBy: "customer", sort: 3 },
    { productCode: "RIDE_HAILING", docType: "psv_licence", required: true, uploadedBy: "customer", sort: 4 },
    { productCode: "RIDE_HAILING", docType: "good_conduct", required: true, uploadedBy: "customer", sort: 5 },
    { productCode: "RIDE_HAILING", docType: "logbook", required: true, uploadedBy: "customer", sort: 6 },
    { productCode: "RIDE_HAILING", docType: "insurance", required: true, uploadedBy: "customer", sort: 7 },
    { productCode: "RIDE_HAILING", docType: "app_profile", required: true, uploadedBy: "customer", sort: 8 },
    { productCode: "RIDE_HAILING", docType: "earnings_statement", required: true, uploadedBy: "customer", sort: 9 },
    { productCode: "RIDE_HAILING", docType: "mpesa_statement", required: true, uploadedBy: "customer", sort: 10 },
    { productCode: "SALARIED", docType: "national_id_front", required: true, uploadedBy: "customer", sort: 1 },
    { productCode: "SALARIED", docType: "national_id_back", required: true, uploadedBy: "customer", sort: 2 },
    { productCode: "SALARIED", docType: "payroll_consent", required: true, uploadedBy: "customer", sort: 3 },
    { productCode: "SALARIED", docType: "employer_confirmation", required: true, uploadedBy: "ops", sort: 4 },
  ];

  for (const req of docRequirements) {
    await db.insert(productDocumentRequirements).values(req).onConflictDoNothing();
  }

  // 5. Garage: Garden Estate Service Point
  const existingGarages = await db
    .select()
    .from(garages)
    .where(eq(garages.name, "Ask AutoParts Garage Limited"))
    .limit(1);

  let primaryGarage = existingGarages[0];
  if (!primaryGarage) {
    const [inserted] = await db
      .insert(garages)
      .values({
        name: "Ask AutoParts Garage Limited",
        branchName: "Garden Estate Service Point",
        address: "Mirema Drive, Off Thika Road, Nairobi",
        lat: "-1.2194",
        lng: "36.8856",
        geofenceRadiusM: 150,
        active: true,
      })
      .returning();
    primaryGarage = inserted;
  }

  // 6. Service catalogue & parts
  const catalogueSeed = [
    {
      code: "CLT-001",
      name: "Clutch kit replacement",
      category: "Transmission",
      descriptionTemplate: "Supply and fit complete clutch kit including pressure plate, disc, and release bearing.",
      labourMinKes: 6000,
      labourMaxKes: 12000,
      parts: [
        { grade: "OEM", brand: "Aisin", priceMinKes: 18000, priceMaxKes: 28000 },
        { grade: "aftermarket", brand: "Exedy", priceMinKes: 12000, priceMaxKes: 18000 },
      ],
    },
    {
      code: "SUS-002",
      name: "Front shock absorbers",
      category: "Suspension",
      descriptionTemplate: "Replace front left and right shock absorber struts.",
      labourMinKes: 3500,
      labourMaxKes: 6500,
      parts: [
        { grade: "OEM", brand: "KYB", priceMinKes: 14000, priceMaxKes: 22000 },
        { grade: "aftermarket", brand: "Monroe", priceMinKes: 9000, priceMaxKes: 14000 },
      ],
    },
    {
      code: "SUS-004",
      name: "Front lower arm bushes",
      category: "Suspension",
      descriptionTemplate: "Press out worn front lower control arm bushes and install replacements.",
      labourMinKes: 3000,
      labourMaxKes: 5500,
      parts: [
        { grade: "OEM", brand: "Toyota Genuine", priceMinKes: 5000, priceMaxKes: 9000 },
        { grade: "aftermarket", brand: "RBI", priceMinKes: 2500, priceMaxKes: 5000 },
      ],
    },
    {
      code: "SUS-016",
      name: "Wheel alignment and balancing",
      category: "Suspension",
      descriptionTemplate: "Four-wheel computerised alignment and wheel balancing with printout.",
      labourMinKes: 2000,
      labourMaxKes: 4000,
      parts: [{ grade: "none", brand: "N/A", priceMinKes: 0, priceMaxKes: 0 }],
    },
    {
      code: "BRK-001",
      name: "Front brake pads",
      category: "Brakes",
      descriptionTemplate: "Replace front disc brake pad set and inspect rotors and callipers.",
      labourMinKes: 1500,
      labourMaxKes: 3000,
      parts: [
        { grade: "OEM", brand: "Akebono", priceMinKes: 4500, priceMaxKes: 8000 },
        { grade: "aftermarket", brand: "Brembo", priceMinKes: 3000, priceMaxKes: 5500 },
      ],
    },
  ];

  for (const svc of catalogueSeed) {
    await db
      .insert(serviceCatalogue)
      .values({
        code: svc.code,
        name: svc.name,
        category: svc.category,
        descriptionTemplate: svc.descriptionTemplate,
        labourMinKes: svc.labourMinKes,
        labourMaxKes: svc.labourMaxKes,
        active: true,
      })
      .onConflictDoNothing({ target: serviceCatalogue.code });

    const [row] = await db
      .select()
      .from(serviceCatalogue)
      .where(eq(serviceCatalogue.code, svc.code))
      .limit(1);

    if (row) {
      const existingParts = await db
        .select()
        .from(catalogueParts)
        .where(eq(catalogueParts.serviceId, row.id))
        .limit(1);

      if (existingParts.length === 0) {
        await db.insert(catalogueParts).values(
          svc.parts.map((p) => ({
            serviceId: row.id,
            ...p,
          })),
        );
      }
    }
  }

  // 7. Employer, active scheme, and 20 eligible employees
  const existingEmployer = await db
    .select()
    .from(employers)
    .where(eq(employers.name, "Savannah Logistics Kenya Ltd"))
    .limit(1);

  let employer = existingEmployer[0];
  if (!employer) {
    const [inserted] = await db
      .insert(employers)
      .values({
        name: "Savannah Logistics Kenya Ltd",
        contactName: "Grace Wanjiku",
        contactEmail: "hr@savannahlogistics.example",
        contactPhone: "+254700100200",
        status: "active",
      })
      .returning();
    employer = inserted;
  }

  await db
    .insert(employerSchemes)
    .values({
      employerId: employer.id,
      lenderId: umba.id,
      agreementRef: "UMBA-SLK-2026-001",
      deductionCapNote: "Maximum 33% of net monthly salary",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      status: "active",
    })
    .onConflictDoNothing({ target: employerSchemes.agreementRef });

  const [scheme] = await db
    .select()
    .from(employerSchemes)
    .where(eq(employerSchemes.agreementRef, "UMBA-SLK-2026-001"))
    .limit(1);

  if (scheme) {
    const batchId = uuidv7();
    const employeeNames = [
      "James Mwangi",
      "Faith Achieng",
      "Peter Kamau",
      "Esther Njeri",
      "David Ochieng",
      "Mercy Wambui",
      "John Kiprop",
      "Lilian Mutua",
      "Samuel Njoroge",
      "Catherine Chebet",
      "Daniel Otieno",
      "Beatrice Nyambura",
      "Joseph Kariuki",
      "Rose Akinyi",
      "Michael Gitau",
      "Agnes Makena",
      "Patrick Barasa",
      "Lucy Wairimu",
      "George Omondi",
      "Hannah Muthoni",
    ];

    for (let i = 0; i < employeeNames.length; i++) {
      const empNo = `SLK-${String(1001 + i).padStart(4, "0")}`;
      const nationalId = String(30001000 + i);
      await db
        .insert(employerEligibleEmployees)
        .values({
          schemeId: scheme.id,
          employeeNumber: empNo,
          fullName: employeeNames[i],
          nationalIdHash: hmacHash(nationalId),
          yearsInService: (i % 7) + 1,
          active: true,
          batchId,
        })
        .onConflictDoNothing();
    }
  }

  // 8. Staff users (1 admin, 2 ops reviewers, 1 ops approver, 2 assessors, 1 garage, 1 accounts)
  const staffSeed: Array<{
    email: string;
    name: string;
    phone: string;
    roles: ("admin" | "ops_reviewer" | "ops_approver" | "assessor" | "garage" | "accounts")[];
    kemraNo?: string;
    garageId?: string;
  }> = [
    { email: "admin@askautoparts.africa", name: "Platform Admin", phone: "+254700000001", roles: ["admin"] },
    { email: "ops1@askautoparts.africa", name: "Ops Reviewer One", phone: "+254700000002", roles: ["ops_reviewer"] },
    { email: "ops2@askautoparts.africa", name: "Ops Reviewer Two", phone: "+254700000003", roles: ["ops_reviewer"] },
    { email: "approver@askautoparts.africa", name: "Ops Approver", phone: "+254700000004", roles: ["ops_approver", "ops_reviewer"] },
    { email: "assessor1@askautoparts.africa", name: "Assessor One", phone: "+254700000005", roles: ["assessor"], kemraNo: "KEMRA-2026-011" },
    { email: "assessor2@askautoparts.africa", name: "Assessor Two", phone: "+254700000006", roles: ["assessor"], kemraNo: "KEMRA-2026-012" },
    { email: "garage@askautoparts.africa", name: "Garage Lead", phone: "+254700000007", roles: ["garage"], garageId: primaryGarage?.id },
    { email: "accounts@askautoparts.africa", name: "Accounts Officer", phone: "+254700000008", roles: ["accounts"] },
  ];

  for (const s of staffSeed) {
    const u = await ensureUser({
      email: s.email,
      name: s.name,
      phoneNumber: s.phone,
      kind: "staff",
      passwordHash,
    });
    await db
      .insert(staffProfiles)
      .values({
        userId: u.id,
        roles: s.roles,
        kemraNo: s.kemraNo ?? null,
        garageId: s.garageId ?? null,
        active: true,
      })
      .onConflictDoNothing({ target: staffProfiles.userId });
  }

  // 9. Lender users (1 approver, 1 viewer per lender)
  const lenderSeed = [
    { email: "approver@fundflow.example", name: "Fund Flow Approver", phone: "+254700000101", lenderId: fundFlow.id, role: "approver" as const },
    { email: "viewer@fundflow.example", name: "Fund Flow Viewer", phone: "+254700000102", lenderId: fundFlow.id, role: "viewer" as const },
    { email: "approver@umba.example", name: "UMBA Approver", phone: "+254700000201", lenderId: umba.id, role: "approver" as const },
    { email: "viewer@umba.example", name: "UMBA Viewer", phone: "+254700000202", lenderId: umba.id, role: "viewer" as const },
  ];

  for (const l of lenderSeed) {
    const u = await ensureUser({
      email: l.email,
      name: l.name,
      phoneNumber: l.phone,
      kind: "lender",
      passwordHash,
    });
    await db
      .insert(lenderUsers)
      .values({
        userId: u.id,
        lenderId: l.lenderId,
        role: l.role,
      })
      .onConflictDoNothing({ target: lenderUsers.userId });
  }

  // 10. Two demo customers
  const demoCustomers = [
    { email: "driver@demo.example", name: "Brian Kipchoge", phone: "+254712345678", sourceCode: "demo_uber" },
    { email: "salaried@demo.example", name: "James Mwangi", phone: "+254722345678", sourceCode: "demo_employer" },
  ];

  for (const c of demoCustomers) {
    const u = await ensureUser({
      email: c.email,
      name: c.name,
      phoneNumber: c.phone,
      kind: "customer",
      passwordHash,
    });
    await db
      .insert(customers)
      .values({
        userId: u.id,
        sourceCode: c.sourceCode,
      })
      .onConflictDoNothing({ target: customers.userId });
  }
}

if (require.main === module) {
  runSeed()
    .then(async () => {
      console.log("Seed completed.");
      await getSql().end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Seed failed:", err);
      await getSql().end();
      process.exit(1);
    });
}

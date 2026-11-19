export const VEHICLE_COMPONENTS = [
  { code: "ENG", label: "Engine" },
  { code: "TRN", label: "Transmission & Clutch" },
  { code: "SUS", label: "Suspension" },
  { code: "BRK", label: "Brakes" },
  { code: "STR", label: "Steering" },
  { code: "ELC", label: "Electrical & Battery" },
  { code: "CLG", label: "Cooling System" },
  { code: "EXH", label: "Exhaust" },
  { code: "TYR", label: "Tyres & Wheel Alignment" },
  { code: "BDY", label: "Body & Glass" },
] as const;

export const URGENCY_OPTIONS = [
  { value: "do_not_delay", label: "Do not delay (safety critical)" },
  { value: "within_1_month", label: "Within 1 month" },
  { value: "with_the_above", label: "With the above" },
  { value: "three_to_four_months", label: "3 to 4 months" },
  { value: "monitor", label: "Monitor" },
  { value: "no_action", label: "No action required" },
] as const;

export const DIAGNOSTICS_OPTIONS = [
  "OBD-II electronic scan",
  "Road test",
  "Engine and fluids inspection",
  "Transmission and clutch test",
  "Suspension and underbody check",
  "Brake system inspection",
  "Battery and charging check",
] as const;

export const PHOTO_KINDS = [
  { value: "front_3q", label: "Front 3/4 view" },
  { value: "rear_3q", label: "Rear 3/4 view" },
  { value: "near_side", label: "Near side" },
  { value: "off_side", label: "Off side" },
  { value: "odometer", label: "Odometer reading" },
  { value: "finding", label: "Finding close-up" },
] as const;

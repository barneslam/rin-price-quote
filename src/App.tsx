import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";

const MOBILE_STYLES = `
  :root {
    --bg: #0a0e27;
    --bg2: #0f1535;
    --bg3: #151d45;
    --bd: #1f2d52;
    --bd2: #2d4170;
    --text: #f5f7fb;
    --text2: #9ca3b3;
    --text3: #6b7590;
    --primary: #e94560;
    --green: #22c55e;
    --gold: #f59e0b;
  }
  input[type="tel"]::placeholder {
    color: #6b7590;
  }
  .pq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .pq-container { max-width: 900px; margin: 0 auto; padding: 24px 20px; }
  .pq-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
  .pq-ref-table { overflow-x: auto; }
  .pq-ref-table table { min-width: 400px; }
  @media (max-width: 768px) {
    .pq-grid { grid-template-columns: 1fr; }
    .pq-container { padding: 12px; }
    .pq-header h1 { font-size: 22px !important; }
    .pq-header { flex-direction: column; align-items: flex-start; }
  }
`;

interface PricingConfig {
  incident_type_id: string;
  incident_name: string;
  base_rate: number;
  per_km_rate: number;
  min_fee: number;
  cancellation_fee_pct: number;
}

interface DistanceTier {
  tier_name: string;
  min_km: number;
  max_km: number | null;
  per_km_rate: number;
}

interface Multiplier {
  name: string;
  multiplier: number;
  start_hour: number;
  end_hour: number;
  days_of_week: number[];
}

interface LongDistanceOverride {
  incident_type_id: string;
  min_distance_km: number;
  base_rate_override: number;
  description: string;
}

interface TierBreakdown {
  tier: string;
  km: number;
  rate: number;
  charge: number;
}

interface QuoteResult {
  base_rate: number;
  base_rate_overridden: boolean;
  original_base: number;
  distance_km: number;
  distance_charge: number;
  tier_breakdown: TierBreakdown[];
  time_multiplier: number;
  time_period: string;
  luxury_surcharge: number;
  subtotal: number;
  min_fee: number;
  final_price: number;
  cancellation_fee: number;
}

const LUXURY_MAKES = [
  "BMW", "Mercedes-Benz", "Audi", "Porsche", "Lexus", "Tesla",
  "Jaguar", "Land Rover", "Range Rover", "Maserati", "Bentley", "Rolls-Royce",
  "Ferrari", "Lamborghini", "McLaren", "Aston Martin",
  "Genesis", "Infiniti", "Acura", "Lotus", "Bugatti", "Cadillac", "Lincoln"
];

// NHTSA-sourced vehicle makes for North American market
const VEHICLE_MAKES: { name: string; luxury: boolean }[] = [
  // Luxury / Premium
  { name: "Acura", luxury: true },
  { name: "Alfa Romeo", luxury: false },
  { name: "Aston Martin", luxury: true },
  { name: "Audi", luxury: true },
  { name: "Bentley", luxury: true },
  { name: "BMW", luxury: true },
  { name: "Bugatti", luxury: true },
  { name: "Buick", luxury: false },
  { name: "Cadillac", luxury: true },
  { name: "Chevrolet", luxury: false },
  { name: "Chrysler", luxury: false },
  { name: "Dodge", luxury: false },
  { name: "Ferrari", luxury: true },
  { name: "Fiat", luxury: false },
  { name: "Ford", luxury: false },
  { name: "Genesis", luxury: true },
  { name: "GMC", luxury: false },
  { name: "Honda", luxury: false },
  { name: "Hyundai", luxury: false },
  { name: "Infiniti", luxury: true },
  { name: "Jaguar", luxury: true },
  { name: "Jeep", luxury: false },
  { name: "Kia", luxury: false },
  { name: "Lamborghini", luxury: true },
  { name: "Land Rover", luxury: true },
  { name: "Lexus", luxury: true },
  { name: "Lincoln", luxury: true },
  { name: "Lotus", luxury: true },
  { name: "Maserati", luxury: true },
  { name: "Mazda", luxury: false },
  { name: "McLaren", luxury: true },
  { name: "Mercedes-Benz", luxury: true },
  { name: "Mini", luxury: false },
  { name: "Mitsubishi", luxury: false },
  { name: "Nissan", luxury: false },
  { name: "Polestar", luxury: true },
  { name: "Porsche", luxury: true },
  { name: "Ram", luxury: false },
  { name: "Rivian", luxury: true },
  { name: "Rolls-Royce", luxury: true },
  { name: "Subaru", luxury: false },
  { name: "Suzuki", luxury: false },
  { name: "Tesla", luxury: true },
  { name: "Toyota", luxury: false },
  { name: "Volkswagen", luxury: false },
  { name: "Volvo", luxury: false },
];

interface AuthUser {
  user_id: string;
  username: string;
  full_name: string;
  company: string;
}

export default function App() {
  // Auth state
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [loginUsername, setLoginUsername] = useState("+1 ");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [authView, setAuthView] = useState<"login" | "register" | "forgot">("login");
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpMaskedPhone, setOtpMaskedPhone] = useState("");
  const [testOtpCode, setTestOtpCode] = useState("");
  const [pendingAuthUser, setPendingAuthUser] = useState<AuthUser | null>(null);
  const [showReferral, setShowReferral] = useState(false);
  const [referralPhone, setReferralPhone] = useState("+1 ");
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralMessage, setReferralMessage] = useState("");

  // Registration state
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regCompany, setRegCompany] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regIsIndependent, setRegIsIndependent] = useState<boolean | null>(null);
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState("");
  const [showRegThankYou, setShowRegThankYou] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [showRegOtp, setShowRegOtp] = useState(false);
  const [regOtpCode, setRegOtpCode] = useState("");
  const [regOtpMasked, setRegOtpMasked] = useState("");
  const [regTestOtpCode, setRegTestOtpCode] = useState(""); // Only populated in dev/fallback
  const [pendingRegPhone, setPendingRegPhone] = useState("");

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [screenLocked, setScreenLocked] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Forgot password state
  const [forgotPhone, setForgotPhone] = useState("+1 ");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const [pricingConfigs, setPricingConfigs] = useState<PricingConfig[]>([]);
  const [distanceTiers, setDistanceTiers] = useState<DistanceTier[]>([]);
  const [multipliers, setMultipliers] = useState<Multiplier[]>([]);
  const [overrides, setOverrides] = useState<LongDistanceOverride[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedIncident, setSelectedIncident] = useState("");
  const [distance, setDistance] = useState(10);
  const [vehicleMake, setVehicleMake] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("standard");

  const [showReference, setShowReference] = useState(false);
  const [pickupLocation, setPickupLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [smsPhone, setSmsPhone] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<{ success: boolean; message: string } | null>(null);

  // Result
  const [quote, setQuote] = useState<QuoteResult | null>(null);

  // AI Agent state
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    loadPricingData();
  }, []);

  // Handle page unload: send referral reminder SMS if logged in
  useEffect(() => {
    if (!authUser) return;

    const handleBeforeUnload = () => {
      // Log session close and optionally send SMS reminder
      supabase.from("quote_usage_log").insert({
        user_id: authUser.user_id,
        username: authUser.username,
        action: "session_closed",
        details: { reminder: "Consider referring drivers to earn rewards!" },
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [authUser]);

  async function loadPricingData() {
    const [configRes, tiersRes, multRes, overrideRes] = await Promise.all([
      supabase.from("pricing_config").select("*, incident_types(incident_name)").eq("is_active", true),
      supabase.from("distance_tiers").select("*").eq("is_active", true).order("min_km"),
      supabase.from("pricing_multipliers").select("*").eq("is_active", true),
      supabase.from("long_distance_overrides").select("*").eq("is_active", true),
    ]);

    const configs: PricingConfig[] = (configRes.data || []).map((c: any) => ({
      incident_type_id: c.incident_type_id,
      incident_name: c.incident_types?.incident_name || "Unknown",
      base_rate: parseFloat(c.base_rate),
      per_km_rate: parseFloat(c.per_km_rate),
      min_fee: parseFloat(c.min_fee),
      cancellation_fee_pct: parseFloat(c.cancellation_fee_pct),
    }));
    configs.sort((a, b) => a.incident_name.localeCompare(b.incident_name));

    setPricingConfigs(configs);
    setDistanceTiers((tiersRes.data || []).map((t: any) => ({
      tier_name: t.tier_name,
      min_km: parseFloat(t.min_km),
      max_km: t.max_km ? parseFloat(t.max_km) : null,
      per_km_rate: parseFloat(t.per_km_rate),
    })));
    setMultipliers((multRes.data || []).map((m: any) => ({
      name: m.name,
      multiplier: parseFloat(m.multiplier),
      start_hour: m.start_hour,
      end_hour: m.end_hour,
      days_of_week: m.days_of_week,
    })));
    setOverrides((overrideRes.data || []).map((o: any) => ({
      incident_type_id: o.incident_type_id,
      min_distance_km: parseFloat(o.min_distance_km),
      base_rate_override: parseFloat(o.base_rate_override),
      description: o.description,
    })));

    if (configs.length > 0) setSelectedIncident(configs[0].incident_type_id);
    setLoading(false);
  }

  // Normalize phone number: remove all non-digits
  function normalizePhone(phone: string): string {
    return phone.replace(/\D/g, "");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    // Normalize phone: strip all non-digits, add back +1 if needed
    const normalizedPhone = normalizePhone(loginUsername);
    if (normalizedPhone.length === 0) {
      setLoginError("Please enter a valid phone number");
      setLoginLoading(false);
      return;
    }

    // Generate OTP directly (phone-based access, no password required)
    const { data, error } = await supabase.rpc("generate_quote_user_otp", {
      p_username: normalizedPhone,  // Use phone as identifier (digits only)
    });

    if (error || !data || !(data as any).success) {
      setLoginError((data as any)?.error || "Phone number not found");
      setLoginLoading(false);
      return;
    }

    // Create temporary user object from OTP response
    const tempUser: AuthUser = {
      user_id: (data as any).user_id,
      username: (data as any).phone || loginUsername,
      full_name: "",  // Will be populated after OTP verification
      company: "",
    };

    setPendingAuthUser(tempUser);
    setOtpMaskedPhone((data as any).phone);
    setTestOtpCode((data as any).code || "");
    setShowOtp(true);
    setLoginLoading(false);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    const normalizedPhone = normalizePhone(loginUsername);
    const { data, error } = await supabase.rpc("verify_quote_user_otp", {
      p_username: normalizedPhone,
      p_code: otpCode.trim(),
    });

    if (error || !data || !(data as any).success) {
      setLoginError((data as any)?.error || "Invalid code");
      setLoginLoading(false);
      return;
    }

    // OTP verified — fetch full user details from database
    const { data: userRecords } = await supabase
      .from("quote_users")
      .select("user_id, username, full_name, company, phone")
      .eq("user_id", (data as any).user_id)
      .limit(1);

    if (userRecords && userRecords.length > 0) {
      const fullUser = userRecords[0];
      const authUser: AuthUser = {
        user_id: fullUser.user_id,
        username: fullUser.username,
        full_name: fullUser.full_name || "",
        company: fullUser.company || "",
      };

      // Log OTP verification
      await supabase.from("quote_usage_log").insert({
        user_id: authUser.user_id,
        username: authUser.username,
        action: "otp_verified",
        details: { phone: fullUser.phone },
      });

      setAuthUser(authUser);
    }

    setLoginLoading(false);
    setShowOtp(false);
    setShowDisclaimer(true);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError("");
    setRegSuccess("");

    if (regPassword !== regConfirmPassword) {
      setRegError("Passwords do not match");
      return;
    }
    if (regPassword.length < 6) {
      setRegError("Password must be at least 6 characters");
      return;
    }
    if (!regFullName || !regPhone) {
      setRegError("Full name and phone number are required");
      return;
    }

    const normalizedPhone = normalizePhone(regPhone);
    if (normalizedPhone.length === 0) {
      setRegError("Please enter a valid phone number");
      return;
    }

    setRegLoading(true);

    // Call edge function to generate OTP and send SMS
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke(
  "send-registration-otp",
  { body: { phone: normalizedPhone } }
);
setRegLoading(false);

if (edgeError || !edgeData?.success) {
  setRegError(edgeData?.error || edgeError?.message || "Failed to send verification code");
  return;
}

    setPendingRegPhone(normalizedPhone);
    setRegOtpMasked(edgeData.phone_masked || `+1 *** *** ${normalizedPhone.slice(-4)}`);
    setRegTestOtpCode(""); // No test code in production
    setShowRegOtp(true);
  }

  async function handleCompleteRegistration(e: React.FormEvent) {
    e.preventDefault();
    setRegError("");
    setRegLoading(true);

    // 1. Verify OTP server-side
    const { data: otpData, error: otpError } = await supabase.rpc("verify_registration_otp", {
      p_phone: pendingRegPhone,
      p_code: regOtpCode.trim(),
    });
    const otpResult = Array.isArray(otpData) ? otpData[0] : otpData;
    if (otpError || !otpResult?.success) {
      setRegError(otpResult?.error || otpError?.message || "Invalid verification code");
      setRegLoading(false);
      return;
    }

    // 2. Create account
    const { data, error } = await supabase.rpc("register_quote_driver", {
      p_username: pendingRegPhone,
      p_password: regPassword,
      p_full_name: regFullName.trim(),
      p_email: regEmail.toLowerCase().trim(),
      p_company: regCompany.trim(),
      p_phone: pendingRegPhone,
    });

    setRegLoading(false);

    if (error || !data || !(data as any).success) {
      setRegError((data as any)?.error || error?.message || "Registration failed");
      setShowRegOtp(false);
      return;
    }

    setShowRegOtp(false);
    setRegOtpCode("");
    setShowRegThankYou(true);
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setForgotError("");
    setForgotSuccess("");

    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError("Passwords do not match");
      return;
    }
    if (forgotNewPassword.length < 6) {
      setForgotError("Password must be at least 6 characters");
      return;
    }

    setForgotLoading(true);
    const { data, error } = await supabase.rpc("reset_quote_password", {
      p_username: forgotPhone.trim(),  // Phone is the unique identifier
      p_new_password: forgotNewPassword,
    });

    if (error || !data || !(data as any).success) {
      setForgotError((data as any)?.error || error?.message || "Reset failed");
      setForgotLoading(false);
      return;
    }

    setForgotSuccess("Password reset! You can now sign in.");
    setForgotLoading(false);
    setTimeout(() => {
      setAuthView("login");
      setLoginUsername(forgotPhone.trim());
      setForgotSuccess("");
    }, 2000);
  }

  async function handleDisclaimerAccept() {
    if (!authUser) return;

    // Log agreement
    await supabase.from("quote_disclaimer_agreements").insert({
      user_id: authUser.user_id,
      username: authUser.username,
      full_name: authUser.full_name,
      disclaimer_version: "2.0",
      user_agent: navigator.userAgent,
    });

    // Log usage
    await supabase.from("quote_usage_log").insert({
      user_id: authUser.user_id,
      username: authUser.username,
      action: "disclaimer_accepted",
      details: { version: "1.0" },
    });

    setDisclaimerAccepted(true);
    setShowDisclaimer(false);
  }

  function handleLogout() {
    setShowLogoutConfirm(true);
  }

  function confirmLogout() {
    if (authUser) {
      supabase.from("quote_usage_log").insert({
        user_id: authUser.user_id,
        username: authUser.username,
        action: "logout",
      });
    }
    setAuthUser(null);
    setDisclaimerAccepted(false);
    setShowLogoutConfirm(false);
  }

  async function getAiQuote() {
    const config = pricingConfigs.find(c => c.incident_type_id === selectedIncident);
    if (!config) return;

    setAiLoading(true);
    setAiError("");
    setAiResult(null);

    try {
      const res = await fetch("https://zyoszbmahxnfcokuzkuv.supabase.co/functions/v1/pricing-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5b3N6Ym1haHhuZmNva3V6a3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDU3OTMsImV4cCI6MjA4OTA4MTc5M30.Ilz4RYTcgZU3IMnABg0eV7iAfFcC0iykyl4DOln-mjY", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5b3N6Ym1haHhuZmNva3V6a3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDU3OTMsImV4cCI6MjA4OTA4MTc5M30.Ilz4RYTcgZU3IMnABg0eV7iAfFcC0iykyl4DOln-mjY" },
        body: JSON.stringify({
          incidentType: config.incident_name,
          distanceKm: distance,
          vehicleMake: vehicleMake || undefined,
          timeOfDay: timeOfDay,
          pickupLocation: pickupLocation || undefined,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      setAiResult(data);

      // Log usage
      if (authUser) {
        supabase.from("quote_usage_log").insert({
          user_id: authUser.user_id,
          username: authUser.username,
          action: "ai_quote_generated",
          details: { incident: config.incident_name, distance, vehicleMake, tier: data.tier, price: data.pricing?.final_price },
        });
      }
    } catch (err) {
      setAiError("Failed to reach AI pricing agent");
    } finally {
      setAiLoading(false);
    }
  }

  async function sendQuoteSms() {
    if (!smsPhone || !quote) return;
    const config = pricingConfigs.find(c => c.incident_type_id === selectedIncident);
    if (!config) return;

    setSmsSending(true);
    setSmsResult(null);

    try {
      const res = await fetch("https://zyoszbmahxnfcokuzkuv.supabase.co/functions/v1/send-quote-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5b3N6Ym1haHhuZmNva3V6a3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDU3OTMsImV4cCI6MjA4OTA4MTc5M30.Ilz4RYTcgZU3IMnABg0eV7iAfFcC0iykyl4DOln-mjY", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5b3N6Ym1haHhuZmNva3V6a3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDU3OTMsImV4cCI6MjA4OTA4MTc5M30.Ilz4RYTcgZU3IMnABg0eV7iAfFcC0iykyl4DOln-mjY" },
        body: JSON.stringify({
          customerPhone: smsPhone,
          incidentType: config.incident_name,
          vehicleInfo: vehicleMake ? `${vehicleMake}` : undefined,
          distance: distance,
          estimatedPrice: quote.final_price,
          breakdown: {
            base_rate: quote.base_rate,
            distance_charge: quote.distance_charge,
            luxury_surcharge: quote.luxury_surcharge,
            time_multiplier: quote.time_multiplier,
          },
          senderName: authUser?.full_name,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSmsResult({ success: true, message: `Quote sent to +1${smsPhone}` });
        if (authUser) {
          supabase.from("quote_usage_log").insert({
            user_id: authUser.user_id, username: authUser.username,
            action: "quote_sms_sent",
            details: { phone: smsPhone, price: quote.final_price, incident: config.incident_name },
          });
        }
      } else {
        setSmsResult({ success: false, message: data.error || "Failed to send" });
      }
    } catch {
      setSmsResult({ success: false, message: "Failed to reach SMS service" });
    } finally {
      setSmsSending(false);
    }
  }

  const calculateQuote = useCallback(() => {
    const config = pricingConfigs.find(c => c.incident_type_id === selectedIncident);
    if (!config) return;

    let baseRate = config.base_rate;
    let baseOverridden = false;
    const originalBase = config.base_rate;

    // Check long-distance override
    const override = overrides.find(
      o => o.incident_type_id === selectedIncident && distance >= o.min_distance_km
    );
    if (override) {
      baseRate = override.base_rate_override;
      baseOverridden = true;
    }

    // Calculate tiered distance
    let distanceCharge = 0;
    const tierBreakdown: TierBreakdown[] = [];
    let remainingKm = distance;

    for (const tier of distanceTiers) {
      if (remainingKm <= 0) break;
      if (distance <= tier.min_km) continue;

      let tierKm: number;
      if (tier.max_km !== null) {
        tierKm = Math.min(remainingKm, Math.max(Math.min(distance, tier.max_km) - tier.min_km, 0));
      } else {
        tierKm = Math.max(distance - tier.min_km, 0);
      }
      tierKm = Math.min(tierKm, remainingKm);

      if (tierKm > 0) {
        const charge = tierKm * tier.per_km_rate;
        distanceCharge += charge;
        remainingKm -= tierKm;
        tierBreakdown.push({
          tier: tier.tier_name,
          km: Math.round(tierKm * 100) / 100,
          rate: tier.per_km_rate,
          charge: Math.round(charge * 100) / 100,
        });
      }
    }

    // Fallback if no tiers matched
    if (distanceCharge === 0 && distance > 0) {
      distanceCharge = distance * config.per_km_rate;
      tierBreakdown.push({
        tier: "Flat Rate (fallback)",
        km: distance,
        rate: config.per_km_rate,
        charge: Math.round(distanceCharge * 100) / 100,
      });
    }

    // Time multiplier
    let timeMultiplier = 1.0;
    let timePeriod = "standard";
    if (timeOfDay !== "standard") {
      const mult = multipliers.find(m => m.name === timeOfDay);
      if (mult) {
        timeMultiplier = mult.multiplier;
        timePeriod = mult.name;
      }
    }

    // Luxury surcharge
    let luxurySurcharge = 0;
    if (vehicleMake && LUXURY_MAKES.some(m => m.toLowerCase() === vehicleMake.toLowerCase())) {
      luxurySurcharge = baseRate * 0.25;
    }

    // Final calculation
    const subtotal = (baseRate + distanceCharge + luxurySurcharge) * timeMultiplier;
    const finalPrice = Math.max(subtotal, config.min_fee);
    const cancellationFee = finalPrice * config.cancellation_fee_pct / 100;

    setQuote({
      base_rate: baseRate,
      base_rate_overridden: baseOverridden,
      original_base: originalBase,
      distance_km: distance,
      distance_charge: Math.round(distanceCharge * 100) / 100,
      tier_breakdown: tierBreakdown,
      time_multiplier: timeMultiplier,
      time_period: timePeriod,
      luxury_surcharge: Math.round(luxurySurcharge * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      min_fee: config.min_fee,
      final_price: Math.round(finalPrice * 100) / 100,
      cancellation_fee: Math.round(cancellationFee * 100) / 100,
    });
  }, [selectedIncident, distance, vehicleMake, timeOfDay, pricingConfigs, distanceTiers, multipliers, overrides]);

  useEffect(() => {
    if (!loading && selectedIncident) calculateQuote();
  }, [loading, selectedIncident, distance, vehicleMake, timeOfDay, calculateQuote]);

// ===== SCREEN LOCK =====
if (screenLocked && authUser) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#0a0e27", flexDirection: "column", gap: 16, fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ fontSize: 36, fontWeight: 700, color: "#e94560" }}>RIN</div>
      <div style={{ fontSize: 15, color: "#9ca3b3" }}>Session locked due to inactivity</div>
      <button onClick={() => setScreenLocked(false)} style={{ marginTop: 8, padding: "12px 40px", borderRadius: 8, background: "#e94560", color: "white", fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer" }}>
        Unlock
      </button>
    </div>
  );
}

// ===== LOGOUT CONFIRMATION =====
if (showLogoutConfirm) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ background: "#0f1535", borderRadius: 16, padding: "32px 24px", width: "100%", maxWidth: 360, border: "1px solid #1f2d52", textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#f5f7fb", marginBottom: 8 }}>Sign Out?</div>
        <div style={{ fontSize: 13, color: "#9ca3b3", marginBottom: 24 }}>You will be returned to the login screen.</div>
        <button onClick={confirmLogout} style={{ width: "100%", padding: 12, borderRadius: 8, background: "#e94560", color: "white", fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer", marginBottom: 10 }}>
          Yes, Sign Out
        </button>
        <button onClick={() => setShowLogoutConfirm(false)} style={{ width: "100%", padding: 12, borderRadius: 8, background: "#151d45", color: "#9ca3b3", fontSize: 14, fontWeight: 600, border: "1px solid #1f2d52", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
  
  // ===== OTP VERIFICATION (must come before general auth check) =====
  if (showOtp && !authUser) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#0a0e27", boxSizing: "border-box" }}>
        <div style={{ width: "100%", maxWidth: 420, background: "#0f1535", borderRadius: 16, padding: "32px 24px", border: "1px solid #1f2d52", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: "#e94560", marginBottom: 4 }}>RIN</div>
            <div style={{ fontSize: 14, color: "#9ca3b3" }}>Verify Your Identity</div>
          </div>

          <div style={{ background: "rgba(233, 69, 96, 0.08)", borderRadius: 8, padding: 16, textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: "#9ca3b3" }}>Verification code sent to</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e94560", marginTop: 4 }}>{otpMaskedPhone}</div>
            <div style={{ fontSize: 12, color: "#6b7590", marginTop: 4 }}>Check your SMS for the 6-digit code</div>
          </div>

          {testOtpCode && (
            <div style={{ background: "rgba(34, 197, 86, 0.08)", borderRadius: 8, padding: 12, marginBottom: 16, textAlign: "center", border: "1px solid rgba(34, 197, 86, 0.25)" }}>
              <div style={{ fontSize: 11, color: "#6b7590", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>TEST CODE (Development Only)</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e", letterSpacing: 4 }}>{testOtpCode}</div>
            </div>
          )}

          <form onSubmit={handleVerifyOtp}>
            <div style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#9ca3b3", marginBottom: 4 }}>Enter 6-Digit Code</div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              autoFocus
              style={{ width: "100%", padding: "14px 12px", borderRadius: 8, border: "1.5px solid #1f2d52", background: "#151d45", color: "#f5f7fb", fontSize: 28, fontWeight: 700, letterSpacing: 8, textAlign: "center", boxSizing: "border-box", marginBottom: 16 }}
            />
            {loginError && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 12px" }}>{loginError}</p>}
            <button
              type="submit"
              disabled={loginLoading || otpCode.length !== 6}
              style={{ width: "100%", padding: "12px", borderRadius: 8, background: "#e94560", color: "white", fontSize: 16, fontWeight: 600, border: "none", cursor: "pointer", opacity: loginLoading ? 0.6 : 1, marginBottom: 12 }}
            >
              {loginLoading ? "Verifying..." : "Verify Code"}
            </button>
            <button
              type="button"
              onClick={() => { setShowOtp(false); setOtpCode(""); setLoginError(""); setPendingAuthUser(null); setTestOtpCode(""); }}
              style={{ width: "100%", padding: "12px", borderRadius: 8, background: "#151d45", color: "#9ca3b3", fontSize: 14, fontWeight: 600, border: "1px solid #1f2d52", cursor: "pointer" }}
            >
              Back to Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ===== REGISTRATION OTP VERIFICATION =====
  if (showRegOtp && !authUser) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#0a0e27", boxSizing: "border-box" }}>
        <div style={{ width: "100%", maxWidth: 420, background: "#0f1535", borderRadius: 16, padding: "32px 24px", border: "1px solid #1f2d52", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: "#e94560", marginBottom: 4 }}>RIN</div>
            <div style={{ fontSize: 14, color: "#9ca3b3" }}>Verify Your Phone Number</div>
          </div>

          <div style={{ background: "rgba(233, 69, 96, 0.08)", borderRadius: 8, padding: 16, textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: "#9ca3b3" }}>Verification code sent to</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e94560", marginTop: 4 }}>{regOtpMasked}</div>
            <div style={{ fontSize: 12, color: "#6b7590", marginTop: 4 }}>Check your SMS for the 6-digit code</div>
          </div>

          {regTestOtpCode && (
            <div style={{ background: "rgba(34, 197, 86, 0.08)", borderRadius: 8, padding: 12, marginBottom: 16, textAlign: "center", border: "1px solid rgba(34, 197, 86, 0.25)" }}>
              <div style={{ fontSize: 11, color: "#6b7590", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>TEST CODE (Development Only)</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e", letterSpacing: 4 }}>{regTestOtpCode}</div>
            </div>
          )}

          <form onSubmit={handleCompleteRegistration}>
            <div style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#9ca3b3", marginBottom: 4 }}>Enter 6-Digit Code</div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={regOtpCode}
              onChange={e => setRegOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              autoFocus
              style={{ width: "100%", padding: "14px 12px", borderRadius: 8, border: "1.5px solid #1f2d52", background: "#151d45", color: "#f5f7fb", fontSize: 28, fontWeight: 700, letterSpacing: 8, textAlign: "center", boxSizing: "border-box", marginBottom: 16 }}
            />
            {regError && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 12px" }}>{regError}</p>}
            <button
              type="submit"
              disabled={regLoading || regOtpCode.length !== 6}
              style={{ width: "100%", padding: "12px", borderRadius: 8, background: "#22c55e", color: "white", fontSize: 16, fontWeight: 600, border: "none", cursor: "pointer", opacity: regLoading ? 0.6 : 1, marginBottom: 12 }}
            >
              {regLoading ? "Creating Account..." : "Verify & Create Account"}
            </button>
            <button
              type="button"
              onClick={() => { setShowRegOtp(false); setRegOtpCode(""); setRegError(""); setRegTestOtpCode(""); }}
              style={{ width: "100%", padding: "12px", borderRadius: 8, background: "#151d45", color: "#9ca3b3", fontSize: 14, fontWeight: 600, border: "1px solid #1f2d52", cursor: "pointer" }}
            >
              Back to Registration
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ===== REGISTRATION THANK YOU SCREEN =====
  if (showRegThankYou && !authUser) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#0a0e27", boxSizing: "border-box" }}>
        <div style={{ width: "100%", maxWidth: 420, background: "#0f1535", borderRadius: 16, padding: "40px 28px", border: "1px solid #1f2d52", boxShadow: "0 24px 80px rgba(0,0,0,0.4)", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e", marginBottom: 8 }}>You're Registered!</div>
          <div style={{ fontSize: 15, color: "#f5f7fb", fontWeight: 600, marginBottom: 16 }}>
            Welcome to RIN, {regFullName.split(" ")[0]}.
          </div>
          <div style={{ background: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.25)", borderRadius: 10, padding: "16px 20px", marginBottom: 28, textAlign: "left" }}>
            <div style={{ fontSize: 13, color: "#9ca3b3", lineHeight: 1.7 }}>
              <div style={{ fontWeight: 600, color: "#22c55e", marginBottom: 8, fontSize: 14 }}>What happens next:</div>
              <div>📱 You will receive an <strong style={{ color: "#f5f7fb" }}>SMS confirmation</strong> to {regOtpMasked} once your application is reviewed.</div>
              <div style={{ marginTop: 8 }}>🔒 Once confirmed, you can sign in and start using the RIN Price Quote tool.</div>
            </div>
          </div>
          <button
            onClick={() => {
              setShowRegThankYou(false);
              setAuthView("login");
              setLoginUsername(pendingRegPhone);
            }}
            style={{ width: "100%", padding: "14px", borderRadius: 8, background: "#e94560", color: "white", fontSize: 16, fontWeight: 600, border: "none", cursor: "pointer" }}
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  // ===== REFERRAL MODAL (optional, on main screen) =====
  if (showReferral && authUser) {
    const referralUrl = `https://rin-app-download-page.netlify.app?ref=${authUser.username}`;
    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", zIndex: 1000 }}>
        <div style={{ width: "100%", maxWidth: 480, background: "#0f1535", borderRadius: 16, padding: "32px 24px", border: "1px solid #1f2d52", boxShadow: "0 24px 80px rgba(0,0,0,0.4)", maxHeight: "90vh", overflowY: "auto" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: "#e94560", marginBottom: 4 }}>RIN</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#f5f7fb" }}>Refer a Driver</div>
          </div>

          <div style={{ background: "rgba(34, 197, 86, 0.1)", borderRadius: 8, padding: 16, textAlign: "center", marginBottom: 20, border: "1px solid rgba(34, 197, 86, 0.3)" }}>
            <div style={{ fontSize: 13, color: "#9ca3b3", marginBottom: 12 }}>Your Referral Link</div>
            <div style={{ background: "#151d45", borderRadius: 8, padding: 12, marginBottom: 12, wordBreak: "break-all", fontSize: 12, color: "#22c55e", fontFamily: "monospace", border: "1px solid rgba(34, 197, 86, 0.2)" }}>{referralUrl}</div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(referralUrl);
                setReferralMessage("Link copied to clipboard!");
                setTimeout(() => setReferralMessage(""), 2000);
              }}
              style={{ width: "100%", padding: "10px 16px", borderRadius: 8, background: "#22c55e", color: "white", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}
            >
              Copy Link
            </button>
          </div>

          <div style={{ background: "rgba(100, 116, 139, 0.08)", borderRadius: 8, padding: 16, marginBottom: 24, fontSize: 13, color: "#9ca3b3", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, color: "#f5f7fb", marginBottom: 8 }}>How it works:</div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Share your referral link with fellow drivers</li>
              <li>They sign up using your link</li>
              <li>You both earn rewards when they complete jobs</li>
            </ul>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            setReferralLoading(true);
            setReferralMessage("");

            const normalizedPhone = normalizePhone(referralPhone);
            if (normalizedPhone.length === 0) {
              setReferralMessage("Please enter a valid phone number");
              setReferralLoading(false);
              return;
            }

            try {
              // Call send-referral-sms edge function
              const res = await fetch("https://zyoszbmahxnfcokuzkuv.supabase.co/functions/v1/send-referral-sms", {
                method: "POST",
                headers: { "Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5b3N6Ym1haHhuZmNva3V6a3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDU3OTMsImV4cCI6MjA4OTA4MTc5M30.Ilz4RYTcgZU3IMnABg0eV7iAfFcC0iykyl4DOln-mjY", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5b3N6Ym1haHhuZmNva3V6a3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDU3OTMsImV4cCI6MjA4OTA4MTc5M30.Ilz4RYTcgZU3IMnABg0eV7iAfFcC0iykyl4DOln-mjY" },
                body: JSON.stringify({
                  phone: `+1${normalizedPhone}`,
                  referrerUsername: authUser.username,
                  referralLink: referralUrl,
                }),
              });

              const data = await res.json();
              if (data.success) {
                setReferralMessage(`✓ SMS sent to +1${normalizedPhone}!`);
                setReferralPhone("+1 ");
                setTimeout(() => { setShowReferral(false); setReferralMessage(""); }, 2500);
              } else {
                setReferralMessage(`Error: ${data.error || "Failed to send SMS"}`);
              }
            } catch (err) {
              setReferralMessage("Error sending SMS. Please try again.");
              console.error(err);
            } finally {
              setReferralLoading(false);
            }
          }}>
            <div style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#9ca3b3", marginBottom: 8 }}>Or send via SMS</div>
            <div style={{ display: "block", fontSize: 12, color: "#6b7590", marginBottom: 12 }}>Enter driver's phone to send them your referral link</div>
            <input
              type="tel"
              value={referralPhone}
              onChange={e => setReferralPhone(e.target.value)}
              placeholder="e.g. +1 (416) 555-1234"
              autoFocus
              style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1.5px solid #1f2d52", background: "#151d45", color: "#f5f7fb", fontSize: 14, boxSizing: "border-box", marginBottom: 12 }}
            />
            {referralMessage && <p style={{ color: referralMessage.includes("copied") || referralMessage.includes("sent") ? "#22c55e" : "#ef4444", fontSize: 12, margin: "0 0 12px", textAlign: "center" }}>{referralMessage}</p>}
            <button
              type="submit"
              disabled={referralLoading}
              style={{ width: "100%", padding: "12px", borderRadius: 8, background: "#e94560", color: "white", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", opacity: referralLoading ? 0.6 : 1, marginBottom: 12 }}
            >
              {referralLoading ? "Sending..." : "Send Via SMS"}
            </button>
            <button
              type="button"
              onClick={() => { setShowReferral(false); setReferralMessage(""); setReferralPhone("+1 "); }}
              style={{ width: "100%", padding: "12px", borderRadius: 8, background: "#151d45", color: "#9ca3b3", fontSize: 14, fontWeight: 600, border: "1px solid #1f2d52", cursor: "pointer" }}
            >
              Close
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ===== AUTH SCREENS (Login / Register / Forgot) =====
  if (!authUser) {
    const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #1f2d52", background: "#151d45", color: "#f5f7fb", fontSize: 15, marginBottom: 14, boxSizing: "border-box" as const };
    const labelStyle = { display: "block" as const, fontWeight: 600, fontSize: 13, color: "#9ca3b3", marginBottom: 4 };
    const btnStyle = { width: "100%", padding: "12px", borderRadius: 8, background: "#e94560", color: "white", fontSize: 16, fontWeight: 600, border: "none", cursor: "pointer" };
    const linkStyle = { color: "#e94560", cursor: "pointer", textDecoration: "underline", background: "none", border: "none", fontSize: 13, padding: 0 };

    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#0a0e27", boxSizing: "border-box" }}>
        <div style={{ width: "100%", maxWidth: 420, background: "#0f1535", borderRadius: 16, padding: "32px 24px", border: "1px solid #1f2d52", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: "#e94560", marginBottom: 4 }}>RIN</div>
            <div style={{ fontSize: 14, color: "#6c757d" }}>
              {authView === "login" && "Price Quote Tool — Sign In"}
              {authView === "register" && "Create Your Account"}
              {authView === "forgot" && "Reset Your Password"}
            </div>
          </div>

          {/* === LOGIN === */}
          {authView === "login" && (
            <form onSubmit={handleLogin}>
              <label style={labelStyle}>Phone Number</label>
              <input type="tel" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} placeholder="e.g. +1 (416) 555-1234" autoFocus style={inputStyle} />
              {loginError && <p style={{ color: "#dc3545", fontSize: 13, margin: "0 0 12px" }}>{loginError}</p>}
              <button type="submit" disabled={loginLoading || !loginUsername} style={{ ...btnStyle, opacity: loginLoading ? 0.6 : 1, marginBottom: 16 }}>
                {loginLoading ? "Sending code..." : "Send OTP Code"}
              </button>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button type="button" onClick={() => { setAuthView("register"); setLoginError(""); }} style={linkStyle}>Create Account</button>
                <button type="button" onClick={() => { setAuthView("forgot"); setLoginError(""); }} style={linkStyle}>Forgot Password?</button>
              </div>
            </form>
          )}

          {/* === REGISTER === */}
          {authView === "register" && (
            <form onSubmit={handleRegister} autoComplete="off">
              <label style={labelStyle}>Full Name *</label>
              <input type="text" value={regFullName} onChange={e => { setRegFullName(e.target.value); if (regError) setRegError(""); }} placeholder="" autoFocus style={inputStyle} />
              <label style={labelStyle}>Phone Number *</label>
              <input
                type="tel"
                value={regPhone}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                  let val = "";
                  if (digits.length <= 3) {
                    val = digits.length > 0 ? `(${digits}` : "";
                  } else if (digits.length <= 6) {
                    val = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
                  } else {
                    val = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
                  }
                  setRegPhone(val);
                  if (regError) setRegError("");
                }}
                placeholder="(647) 555-1234"
                style={inputStyle}
              />
              <label style={labelStyle}>Operator Type *</label>
              <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#f5f7fb", fontSize: 14 }}>
                  <input type="radio" name="operatorType" checked={regIsIndependent === true} onChange={() => setRegIsIndependent(true)} style={{ cursor: "pointer" }} />
                  Independent Operator
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#f5f7fb", fontSize: 14 }}>
                  <input type="radio" name="operatorType" checked={regIsIndependent === false} onChange={() => setRegIsIndependent(false)} style={{ cursor: "pointer" }} />
                  Fleet Operator
                </label>
              </div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={regEmail} onChange={e => { setRegEmail(e.target.value); if (regError) setRegError(""); }} placeholder="" autoComplete="off" style={inputStyle} />
              <label style={labelStyle}>Company</label>
              <input type="text" value={regCompany} onChange={e => { setRegCompany(e.target.value); if (regError) setRegError(""); }} placeholder="" autoComplete="off" style={inputStyle} />
              <label style={labelStyle}>Password * <span style={{ fontWeight: 400, color: "#6b7590" }}>(min 6 characters)</span></label>
              <input type="password" value={regPassword} onChange={e => { setRegPassword(e.target.value); if (regError) setRegError(""); }} placeholder="" autoComplete="new-password" style={inputStyle} />
              <label style={labelStyle}>Confirm Password *</label>
              <input type="password" value={regConfirmPassword} onChange={e => { setRegConfirmPassword(e.target.value); if (regError) setRegError(""); }} placeholder="" autoComplete="new-password" style={inputStyle} />
              {regError && <p style={{ color: "#dc3545", fontSize: 13, margin: "0 0 12px" }}>{regError}</p>}
              {regSuccess && <p style={{ color: "#198754", fontSize: 13, margin: "0 0 12px", fontWeight: 600 }}>{regSuccess}</p>}
              <button type="submit" disabled={regLoading} style={{ ...btnStyle, background: "#22c55e", opacity: regLoading ? 0.6 : 1, marginBottom: 16 }}>
                {regLoading ? "Creating Account..." : "Create Account"}
              </button>
              <div style={{ textAlign: "center" }}>
                <button type="button" onClick={() => { setAuthView("login"); setRegError(""); setRegSuccess(""); }} style={linkStyle}>Already have an account? Sign In</button>
              </div>
            </form>
          )}

          {/* === FORGOT PASSWORD === */}
          {authView === "forgot" && (
            <form onSubmit={handleForgotPassword}>
              <p style={{ fontSize: 13, color: "#6c757d", marginTop: 0, marginBottom: 16 }}>
                Enter your phone number to reset your password.
              </p>
              <label style={labelStyle}>Phone Number</label>
              <input type="tel" value={forgotPhone} onChange={e => setForgotPhone(e.target.value)} placeholder="e.g. +1 (416) 555-1234" autoFocus style={inputStyle} />
              <label style={labelStyle}>New Password <span style={{ fontWeight: 400, color: "#6b7590" }}>(min 6 characters)</span></label>
              <input type="password" value={forgotNewPassword} onChange={e => setForgotNewPassword(e.target.value)} placeholder="Choose a new password" style={inputStyle} />
              <label style={labelStyle}>Confirm New Password</label>
              <input type="password" value={forgotConfirmPassword} onChange={e => setForgotConfirmPassword(e.target.value)} placeholder="Re-enter new password" style={inputStyle} />
              {forgotError && <p style={{ color: "#dc3545", fontSize: 13, margin: "0 0 12px" }}>{forgotError}</p>}
              {forgotSuccess && <p style={{ color: "#198754", fontSize: 13, margin: "0 0 12px", fontWeight: 600 }}>{forgotSuccess}</p>}
              <button type="submit" disabled={forgotLoading} style={{ ...btnStyle, background: "#f59e0b", opacity: forgotLoading ? 0.6 : 1, marginBottom: 16 }}>
                {forgotLoading ? "Resetting..." : "Reset Password"}
              </button>
              <div style={{ textAlign: "center" }}>
                <button type="button" onClick={() => { setAuthView("login"); setForgotError(""); setForgotSuccess(""); }} style={linkStyle}>Back to Sign In</button>
              </div>
            </form>
          )}

          <p style={{ textAlign: "center", fontSize: 11, color: "#adb5bd", marginTop: 20, marginBottom: 0, lineHeight: 1.5 }}>
            This tool is restricted to authorized RIN personnel only.<br />
            All access is logged and audited.
          </p>
        </div>
      </div>
    );
  }



  // ===== DISCLAIMER POPUP =====
  if (showDisclaimer || !disclaimerAccepted) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "rgba(0,0,0,0.85)", boxSizing: "border-box" }}>
        <div style={{ width: "100%", maxWidth: 600, maxHeight: "90vh", overflow: "auto", background: "#0f1535", borderRadius: 16, padding: "32px 24px", border: "1px solid #1f2d52", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e94560" }}>Disclaimer &amp; Terms of Use</div>
            <p style={{ color: "#9ca3b3", fontSize: 13 }}>Please read carefully before proceeding</p>
          </div>

          <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 20, fontSize: 13, lineHeight: 1.8, maxHeight: 400, overflow: "auto", border: "1px solid #1f2d52", marginBottom: 24, color: "#f5f7fb" }}>
            <p style={{ fontWeight: 700, fontSize: 15, marginTop: 0 }}>RIN PRICE QUOTE TOOL &mdash; TERMS OF USE &amp; PRIVACY NOTICE</p>
            <p style={{ fontWeight: 700 }}>Operated by Roadside Intelligence Network</p>
            <p>PO Box 69068, St. Clair Station, Toronto, Ontario M4T 1A3, Canada</p>
            <p style={{ fontSize: 12, color: "#9ca3b3" }}>Disclaimer Version 2.0 &mdash; Effective April 10, 2026</p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>1. For Reference Only &mdash; Pricing Estimates</p>
            <p>All pricing information, estimates, and quotes generated by this tool are provided <strong>for reference and verification purposes only</strong>. They do not constitute a binding offer, contract, or guarantee of pricing for any roadside assistance service. Actual charges may vary based on real-time conditions, driver availability, vehicle condition, and on-scene assessment. Commission rates and driver payouts are internal figures and may not reflect final customer billing.</p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>2. AI-Generated Content Disclosure</p>
            <p>This tool uses <strong>artificial intelligence (AI) technology</strong> to generate pricing estimates. AI-generated prices are calculated using database-driven models and may contain errors, inaccuracies, or unexpected results. All AI outputs should be reviewed by qualified personnel before being used for customer-facing quotations. Roadside Intelligence Network does not guarantee the accuracy of AI-generated pricing and recommends human verification for all quotes.</p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>3. No Warranty or Liability</p>
            <p>This tool is provided "as is" without warranty of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. Roadside Intelligence Network, its officers, directors, employees, affiliates, and partners <strong>make no representations or warranties</strong> regarding the accuracy, completeness, timeliness, or reliability of any pricing data, AI outputs, or other information displayed. To the maximum extent permitted by law, we shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from the use of or reliance on this tool.</p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>4. Indemnification</p>
            <p>By using this tool, you agree to <strong>indemnify, defend, and hold harmless</strong> Roadside Intelligence Network, its officers, directors, employees, agents, contractors, and partners from and against any and all claims, liabilities, damages, losses, costs, or expenses (including reasonable legal fees and court costs) arising from or related to: (a) your use of this tool; (b) any reliance on pricing information provided herein; (c) any breach of these terms; or (d) any unauthorized sharing of tool access, credentials, or proprietary pricing data.</p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>5. Data Collection, Privacy &amp; PIPEDA Compliance</p>
            <p>In accordance with Canada's <strong>Personal Information Protection and Electronic Documents Act (PIPEDA)</strong>, we collect and process the following personal information:</p>
            <p style={{ paddingLeft: 16 }}>
              &bull; <strong>Account data:</strong> Full name, username, email address, phone number, company name<br/>
              &bull; <strong>Usage data:</strong> Login timestamps, tool interactions, quotes generated, AI agent usage<br/>
              &bull; <strong>Technical data:</strong> Browser user agent, IP address (if available), session information<br/>
              &bull; <strong>Location data:</strong> GPS coordinates (if you grant permission), pickup locations entered<br/>
              &bull; <strong>Agreement records:</strong> Timestamp and version of terms accepted
            </p>
            <p><strong>Purpose of collection:</strong> This data is collected for platform security, audit compliance, pricing accuracy improvement, service optimization, and fraud prevention.</p>
            <p><strong>Data retention:</strong> Account data is retained for the duration of your account plus 2 years. Usage logs and quote history are retained for 3 years for audit and compliance purposes. Agreement records are retained indefinitely as legal evidence.</p>
            <p><strong>Your rights under PIPEDA:</strong> You have the right to: (a) access your personal information held by us; (b) request correction of inaccurate data; (c) withdraw consent for data collection (which may result in loss of access); (d) file a complaint with the Office of the Privacy Commissioner of Canada. To exercise these rights, contact: <strong>privacy@rintow.ca</strong></p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>6. Cookies &amp; Tracking</p>
            <p>This tool uses browser local storage and cookies for session management and authentication. Third-party services (Supabase, Anthropic) may set additional cookies or process data as described in their respective privacy policies.</p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>7. Phone Number Consent</p>
            <p>By providing your phone number during registration, you consent to Roadside Intelligence Network storing and using it for: (a) account verification and identity confirmation; (b) security and fraud prevention; (c) contacting you regarding your account or platform operations. We will not use your phone number for marketing without separate explicit consent.</p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>8. Confidentiality &amp; Proprietary Information</p>
            <p>All pricing data, rate structures, commission models, distance tiers, surcharge rules, and AI pricing logic accessed through this tool are <strong>proprietary and confidential</strong> information of Roadside Intelligence Network. You agree not to: (a) share, distribute, or disclose any pricing data or tool outputs to unauthorized third parties; (b) screenshot, copy, or reproduce pricing information for use outside of authorized RIN operations; (c) reverse-engineer the pricing algorithms or AI models. Breach of confidentiality may result in immediate account termination and legal action.</p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>9. Authorized Use Only</p>
            <p>This tool is restricted to authorized RIN personnel, contracted drivers, and approved partners. You may not share your login credentials or allow unauthorized access. Each user must register their own account with valid personal information. Any unauthorized use, credential sharing, or fraudulent registration may result in account suspension and legal action.</p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>10. GPS &amp; Location Services</p>
            <p>If you grant location permission, this tool may collect your GPS coordinates to: (a) auto-fill pickup locations; (b) calculate accurate distance-based pricing; (c) improve service area coverage analysis. Location data is logged with your quotes for accuracy verification. You may decline location permission, in which case you must manually enter location information.</p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>11. Governing Law &amp; Dispute Resolution</p>
            <p>These terms are governed by and construed in accordance with the laws of the <strong>Province of Ontario, Canada</strong>, and the federal laws of Canada applicable therein, without regard to conflict of law principles. Any dispute arising from or relating to these terms or your use of this tool shall be subject to the exclusive jurisdiction of the courts of the Province of Ontario, sitting in Toronto.</p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>12. Changes to Terms</p>
            <p>Roadside Intelligence Network reserves the right to modify these terms at any time. Material changes will require re-acceptance upon your next login. Continued use after notification constitutes acceptance of the updated terms.</p>

            <p style={{ fontWeight: 700, marginTop: 16 }}>13. Acceptance</p>
            <p>By clicking "I Agree" below, you acknowledge that you have read, understood, and agree to be bound by all sections of these Terms of Use and Privacy Notice. Your acceptance is recorded with a timestamp for legal and audit purposes.</p>
          </div>

          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#f5f7fb", marginBottom: 16 }}>
              Logged in as: <span style={{ color: "#e94560" }}>{authUser.full_name}</span> ({authUser.company})
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={handleLogout}
                style={{ padding: "12px 32px", borderRadius: 8, background: "#151d45", color: "#9ca3b3", fontSize: 15, fontWeight: 600, border: "1px solid #1f2d52", cursor: "pointer", minWidth: 160 }}
              >
                Decline &amp; Logout
              </button>
              <button
                onClick={handleDisclaimerAccept}
                style={{ padding: "12px 32px", borderRadius: 8, background: "#22c55e", color: "white", fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer", minWidth: 200 }}
              >
                I Agree to These Terms
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", fontFamily: "-apple-system, sans-serif" }}>
        <p>Loading pricing data...</p>
      </div>
    );
  }

  const selectedConfig = pricingConfigs.find(c => c.incident_type_id === selectedIncident);
  const isLuxury = vehicleMake && LUXURY_MAKES.some(m => m.toLowerCase() === vehicleMake.toLowerCase());

  return (
    <div className="pq-container" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#0a0e27", minHeight: "100vh" }}>
      <style>{MOBILE_STYLES}</style>
      {/* Header */}
      <div className="pq-header" style={{ background: "#e94560", color: "white", padding: "20px 24px", borderRadius: 12, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>RIN Price Quote Tool</h1>
          <p style={{ margin: "8px 0 0", opacity: 0.85, fontSize: 14 }}>
            Logged in as <strong>{authUser.full_name}</strong> ({authUser.company})
        </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => setShowReferral(true)}
            style={{ padding: "10px 20px", borderRadius: 8, background: "#22c55e", color: "white", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(34, 197, 86, 0.4)", transition: "all 0.2s ease" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#16a34a"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(34, 197, 86, 0.5)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#22c55e"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(34, 197, 86, 0.4)"; }}
          >
            Refer a Driver
          </button>
          <a
            href="https://drive-my-own.netlify.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: "10px 20px", borderRadius: 8, background: "#3b82f6", color: "white", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", transition: "all 0.2s ease", boxShadow: "0 4px 12px rgba(59, 130, 246, 0.4)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(59, 130, 246, 0.5)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#3b82f6"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.4)"; }}
          >
            Become a Driver
          </a>
          <button
            onClick={handleLogout}
            style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(255,255,255,0.2)", color: "white", fontSize: 13, fontWeight: 600, border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer" }}
          >
            Logout
          </button>
        </div>
      </div>

      <div className="pq-grid">
        {/* Left: Inputs */}
        <div style={{ background: "#0f1535", borderRadius: 12, padding: 20, border: "1px solid #1f2d52" }}>
          <h2 style={{ marginTop: 0, fontSize: 18, color: "#f5f7fb" }}>Job Details</h2>

          <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#9ca3b3", marginBottom: 4 }}>Service Type</label>
          <select
            value={selectedIncident}
            onChange={e => setSelectedIncident(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #1f2d52", fontSize: 15, marginBottom: 16, background: "#151d45", color: "#f5f7fb" }}
          >
            {pricingConfigs.map(c => (
              <option key={c.incident_type_id} value={c.incident_type_id}>
                {c.incident_name} &mdash; ${c.base_rate} base
              </option>
            ))}
          </select>

          <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#9ca3b3", marginBottom: 4 }}>
            Distance: <strong style={{ color: "#e94560" }}>{distance} km</strong>
          </label>
          <input
            type="range"
            min={1}
            max={100}
            value={distance}
            onChange={e => setDistance(parseInt(e.target.value))}
            style={{ width: "100%", marginBottom: 4 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7590", marginBottom: 16 }}>
            <span>1 km</span><span>25 km</span><span>50 km</span><span>75 km</span><span>100 km</span>
          </div>

          <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#9ca3b3", marginBottom: 4 }}>Vehicle Make</label>
          <select
            value={vehicleMake}
            onChange={e => setVehicleMake(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${isLuxury ? "#dc3545" : "#1f2d52"}`, fontSize: 15, marginBottom: 4, background: isLuxury ? "rgba(220,53,69,0.1)" : "#151d45", color: "#f5f7fb" }}
          >
            <option value="">-- No vehicle selected --</option>
            <optgroup label="Standard Vehicles">
              {VEHICLE_MAKES.filter(v => !v.luxury).map(v => (
                <option key={v.name} value={v.name}>{v.name}</option>
              ))}
            </optgroup>
            <optgroup label="Luxury / Premium (+25% surcharge)">
              {VEHICLE_MAKES.filter(v => v.luxury).map(v => (
                <option key={v.name} value={v.name}>{v.name}</option>
              ))}
            </optgroup>
          </select>
          {isLuxury && (
            <p style={{ fontSize: 12, color: "#dc3545", fontWeight: 600, margin: "2px 0 16px" }}>
              Luxury vehicle &mdash; 25% surcharge on base rate applies
            </p>
          )}
          {!isLuxury && <div style={{ marginBottom: 16 }} />}

          <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#9ca3b3", marginBottom: 4 }}>Time of Day</label>
          <select
            value={timeOfDay}
            onChange={e => setTimeOfDay(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #1f2d52", fontSize: 15, marginBottom: 16, background: "#151d45", color: "#f5f7fb" }}
          >
            <option value="standard">Standard (9am-4pm) &mdash; 1.00x</option>
            <option value="early_morning">Early Morning (6-7am) &mdash; 1.15x</option>
            <option value="peak_morning">Peak Morning (7-9am weekdays) &mdash; 1.25x</option>
            <option value="peak_evening">Peak Evening (4-7pm weekdays) &mdash; 1.25x</option>
            <option value="night">Night (9pm-6am) &mdash; 1.40x</option>
          </select>

          <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#9ca3b3", marginBottom: 4 }}>Pickup Location</label>
          <input
            type="text"
            value={pickupLocation}
            onChange={e => setPickupLocation(e.target.value)}
            placeholder="e.g. 401 & Keele St, Toronto"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #1f2d52", fontSize: 15, marginBottom: 14, boxSizing: "border-box", background: "#151d45", color: "#f5f7fb" }}
          />

          <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#9ca3b3", marginBottom: 4 }}>Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Vehicle in underground parking, no keys..."
            rows={2}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #1f2d52", fontSize: 15, marginBottom: 16, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", background: "#151d45", color: "#f5f7fb" }}
          />

          <button
            onClick={getAiQuote}
            disabled={aiLoading}
            style={{ width: "100%", padding: "12px", borderRadius: 8, background: aiLoading ? "#6c757d" : "#7c3aed", color: "white", fontSize: 15, fontWeight: 600, border: "none", cursor: aiLoading ? "default" : "pointer" }}
          >
            {aiLoading ? "AI Agent Thinking..." : "Get AI Agent Quote"}
          </button>
          {aiError && <p style={{ color: "#dc3545", fontSize: 13, marginTop: 8 }}>{aiError}</p>}
        </div>

        {/* Right: Quote Result */}
        <div style={{ background: "#0f1535", borderRadius: 12, padding: 20, border: "1px solid #1f2d52" }}>
          <h2 style={{ marginTop: 0, fontSize: 18, color: "#f5f7fb" }}>Price Breakdown</h2>

          {quote && (
            <>
              {/* Final Price */}
              <div style={{ background: "#e94560", color: "white", borderRadius: 10, padding: "20px 24px", marginBottom: 20, textAlign: "center" }}>
                <div style={{ fontSize: 42, fontWeight: 700 }}>${quote.final_price.toFixed(2)}</div>
                <div style={{ fontSize: 13, opacity: 0.85 }}>Estimated Price ({selectedConfig?.incident_name})</div>
              </div>

              {/* Line items */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #1f2d52" }}>
                    <td style={{ padding: "8px 0", color: "#9ca3b3" }}>Base Rate</td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600 }}>
                      {quote.base_rate_overridden ? (
                        <><span style={{ textDecoration: "line-through", color: "#6b7590", marginRight: 8 }}>${quote.original_base.toFixed(2)}</span>${quote.base_rate.toFixed(2)} <span style={{ fontSize: 11, color: "#dc3545" }}>(long dist.)</span></>
                      ) : (
                        `$${quote.base_rate.toFixed(2)}`
                      )}
                    </td>
                  </tr>

                  {/* Distance tiers */}
                  {quote.tier_breakdown.map((t, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #1f2d52" }}>
                      <td style={{ padding: "8px 0", color: "#9ca3b3", paddingLeft: i === 0 ? 0 : 16 }}>
                        {i === 0 ? "Distance" : ""} <span style={{ fontSize: 12, color: "#6b7590" }}>{t.tier} ({t.km}km x ${t.rate})</span>
                      </td>
                      <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600, color: "#f5f7fb" }}>${t.charge.toFixed(2)}</td>
                    </tr>
                  ))}

                  <tr style={{ borderBottom: "1px solid #1f2d52" }}>
                    <td style={{ padding: "8px 0", color: "#9ca3b3" }}>Distance Total ({quote.distance_km}km)</td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600, color: "#f5f7fb" }}>${quote.distance_charge.toFixed(2)}</td>
                  </tr>

                  {quote.luxury_surcharge > 0 && (
                    <tr style={{ borderBottom: "1px solid #1f2d52" }}>
                      <td style={{ padding: "8px 0", color: "#dc3545" }}>Luxury Surcharge (25%)</td>
                      <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600, color: "#dc3545" }}>+${quote.luxury_surcharge.toFixed(2)}</td>
                    </tr>
                  )}

                  {quote.time_multiplier !== 1.0 && (
                    <tr style={{ borderBottom: "1px solid #1f2d52" }}>
                      <td style={{ padding: "8px 0", color: "#f59e0b" }}>Time Multiplier ({quote.time_period})</td>
                      <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600, color: "#f59e0b" }}>x{quote.time_multiplier.toFixed(2)}</td>
                    </tr>
                  )}

                  <tr style={{ borderTop: "2px solid #e94560" }}>
                    <td style={{ padding: "12px 0", fontWeight: 700, fontSize: 16, color: "#f5f7fb" }}>Total</td>
                    <td style={{ padding: "12px 0", textAlign: "right", fontWeight: 700, fontSize: 16, color: "#f5f7fb" }}>${quote.final_price.toFixed(2)}</td>
                  </tr>

                  <tr style={{ borderBottom: "1px solid #1f2d52" }}>
                    <td style={{ padding: "6px 0", color: "#6b7590", fontSize: 12 }}>Cancellation Fee (50%)</td>
                    <td style={{ padding: "6px 0", textAlign: "right", color: "#6b7590", fontSize: 12 }}>${quote.cancellation_fee.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "6px 0", color: "#6b7590", fontSize: 12 }}>Minimum Fee</td>
                    <td style={{ padding: "6px 0", textAlign: "right", color: "#6b7590", fontSize: 12 }}>${quote.min_fee.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Formula */}
              <div style={{ marginTop: 20, background: "#151d45", borderRadius: 8, padding: 16, fontSize: 13, fontFamily: "monospace", color: "#f5f7fb", border: "1px solid #1f2d52" }}>
                <strong>Formula:</strong><br />
                ({quote.base_rate_overridden ? `$${quote.base_rate} override` : `$${quote.base_rate} base`}
                {" + "}${quote.distance_charge} distance
                {quote.luxury_surcharge > 0 ? ` + $${quote.luxury_surcharge} luxury` : ""}
                ){quote.time_multiplier !== 1.0 ? ` x ${quote.time_multiplier}` : ""}
                {" = "}
                <strong>${quote.final_price.toFixed(2)}</strong>
              </div>

              {/* Send Quote via SMS */}
              <div style={{ marginTop: 16, padding: "14px 0 0", borderTop: "1px solid #1f2d52" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#f5f7fb", marginBottom: 8 }}>Send Quote to Customer</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ width: 40, padding: "8px 0", textAlign: "center", fontSize: 13, color: "#6b7590", border: "1px solid #1f2d52", borderRadius: "8px 0 0 8px", background: "#151d45" }}>+1</div>
                  <input
                    type="tel"
                    value={smsPhone}
                    onChange={e => setSmsPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="6475551234"
                    maxLength={10}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: "0 8px 8px 0", border: "1px solid #1f2d52", fontSize: 14, boxSizing: "border-box", background: "#151d45", color: "#f5f7fb" }}
                  />
                  <button
                    onClick={sendQuoteSms}
                    disabled={smsSending || smsPhone.length !== 10}
                    style={{ padding: "8px 16px", borderRadius: 8, background: smsSending ? "#6c757d" : "#22c55e", color: "white", fontSize: 13, fontWeight: 600, border: "none", cursor: smsSending ? "default" : "pointer", whiteSpace: "nowrap" }}
                  >
                    {smsSending ? "Sending..." : "Send SMS"}
                  </button>
                </div>
                {smsResult && (
                  <div style={{ fontSize: 12, marginTop: 6, color: smsResult.success ? "#198754" : "#dc3545", fontWeight: 600 }}>
                    {smsResult.message}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* AI Agent Result */}
      {aiResult && (
        <div style={{ marginTop: 24, background: "#fff", borderRadius: 12, padding: 20, border: "2px solid #e94560" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, color: "#e94560" }}>AI Agent Quote</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 12, background: aiResult.tier === "tools" ? "#e94560" : "#22c55e", color: "white", fontWeight: 600 }}>
                {aiResult.tier === "tools" ? "Deep Reasoning" : "Fast Quote"}
              </span>
              {aiResult.escalated && (
                <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 12, background: "#f59e0b", color: "white", fontWeight: 600 }}>
                  Escalated
                </span>
              )}
              {aiResult.duration_ms && (
                <span style={{ fontSize: 11, color: "#6b7590" }}>{(aiResult.duration_ms / 1000).toFixed(1)}s</span>
              )}
            </div>
          </div>

          {(() => {
            const p = aiResult.pricing || {};
            const price = p.final_price;
            const reasoning = p.reasoning;
            const confidence = p.confidence;
            const surcharges = p.surcharges || [];
            const toolsUsed = p.tools_used || [];
            const tierBreakdown = p.tier_breakdown || [];

            return (
              <>
                {price && (
                  <div style={{ background: "#e94560", color: "white", borderRadius: 10, padding: "16px 20px", marginBottom: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 36, fontWeight: 700 }}>${Number(price).toFixed(2)}</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      AI Agent Price
                      {confidence && <> &mdash; Confidence: <strong>{confidence}</strong></>}
                    </div>
                  </div>
                )}

                {/* Comparison with formula */}
                {price && quote && (
                  <div style={{ background: Math.abs(price - quote.final_price) < 1 ? "#d1e7dd" : "#fff3cd", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                    <strong>Formula: ${quote.final_price.toFixed(2)}</strong> vs <strong>AI: ${Number(price).toFixed(2)}</strong>
                    {" "}&mdash;{" "}
                    {Math.abs(price - quote.final_price) < 1 ? (
                      <span style={{ color: "#22c55e" }}>Prices match</span>
                    ) : (
                      <span style={{ color: "#f59e0b" }}>
                        Difference: ${Math.abs(price - quote.final_price).toFixed(2)}
                        {" "}({price > quote.final_price ? "AI higher" : "Formula higher"})
                      </span>
                    )}
                  </div>
                )}

                {/* Surcharges */}
                {surcharges.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong style={{ fontSize: 13 }}>Surcharges Applied:</strong>
                    {surcharges.map((s: any, i: number) => (
                      <div key={i} style={{ fontSize: 13, color: "#dc3545", padding: "4px 0", paddingLeft: 12 }}>
                        {s.name}: ${Number(s.amount).toFixed(2)} &mdash; <em>{s.reason}</em>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tier breakdown */}
                {tierBreakdown.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong style={{ fontSize: 13 }}>Distance Breakdown:</strong>
                    {tierBreakdown.map((t: any, i: number) => (
                      <div key={i} style={{ fontSize: 13, color: "#9ca3b3", padding: "2px 0", paddingLeft: 12 }}>
                        {t.tier}: {t.km}km x ${t.rate}/km = ${Number(t.charge).toFixed(2)}
                      </div>
                    ))}
                  </div>
                )}

                {/* Reasoning */}
                {reasoning && (
                  <div style={{ background: "#151d45", borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.6, marginBottom: 12, maxHeight: 200, overflow: "auto" }}>
                    <strong>AI Reasoning:</strong><br />
                    {reasoning}
                  </div>
                )}

                {/* Tools used */}
                {toolsUsed.length > 0 && (
                  <div style={{ fontSize: 11, color: "#6b7590" }}>
                    Tools used: {toolsUsed.join(", ")}
                  </div>
                )}

                {/* Escalation reason */}
                {aiResult.escalation_reason && (
                  <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>
                    Escalation: {aiResult.escalation_reason}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Reference Tables Toggle */}
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <button
          onClick={() => setShowReference(!showReference)}
          style={{ padding: "10px 24px", borderRadius: 8, background: showReference ? "#e94560" : "#fff", color: showReference ? "#fff" : "#495057", fontSize: 14, fontWeight: 600, border: `1px solid ${showReference ? "#e94560" : "#dee2e6"}`, cursor: "pointer" }}
        >
          {showReference ? "Hide Reference Tables" : "View Reference Tables"}
        </button>
      </div>

      {showReference && (
      <div className="pq-ref-table" style={{ marginTop: 16, background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #dee2e6" }}>
        <h2 style={{ marginTop: 0, fontSize: 18, color: "#f5f7fb" }}>Reference: All Pricing Data</h2>

        <h3 style={{ fontSize: 15, color: "#495057" }}>Service Types &amp; Base Rates</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#e9ecef" }}>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Service</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Base Rate</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Per-km (fallback)</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Min Fee</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Cancel %</th>
            </tr>
          </thead>
          <tbody>
            {pricingConfigs.map(c => (
              <tr key={c.incident_type_id} style={{ borderBottom: "1px solid #1f2d52" }}>
                <td style={{ padding: "6px 10px" }}>{c.incident_name}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>${c.base_rate.toFixed(2)}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>${c.per_km_rate.toFixed(2)}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>${c.min_fee.toFixed(2)}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>{c.cancellation_fee_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ fontSize: 15, color: "#495057", marginTop: 24 }}>Distance Tiers</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#e9ecef" }}>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Tier</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Range</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {distanceTiers.map(t => (
              <tr key={t.tier_name} style={{ borderBottom: "1px solid #1f2d52" }}>
                <td style={{ padding: "6px 10px" }}>{t.tier_name}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>{t.min_km} &ndash; {t.max_km ? `${t.max_km} km` : "unlimited"}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>${t.per_km_rate.toFixed(2)}/km</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ fontSize: 15, color: "#495057", marginTop: 24 }}>Time Multipliers</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#e9ecef" }}>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Period</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Hours</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Multiplier</th>
            </tr>
          </thead>
          <tbody>
            {multipliers.sort((a, b) => a.multiplier - b.multiplier).map(m => (
              <tr key={m.name} style={{ borderBottom: "1px solid #1f2d52" }}>
                <td style={{ padding: "6px 10px" }}>{m.name.replace(/_/g, " ")}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>{m.start_hour}:00 &ndash; {m.end_hour}:00</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>{m.multiplier.toFixed(2)}x</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ fontSize: 15, color: "#495057", marginTop: 24 }}>Long Distance Overrides</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#e9ecef" }}>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Service</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Trigger</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Override Base</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((o, i) => {
              const config = pricingConfigs.find(c => c.incident_type_id === o.incident_type_id);
              return (
                <tr key={i} style={{ borderBottom: "1px solid #1f2d52" }}>
                  <td style={{ padding: "6px 10px" }}>{config?.incident_name || "Unknown"}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>&gt; {o.min_distance_km} km</td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>${o.base_rate_override.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <footer style={{ marginTop: 32, textAlign: "center", color: "#6b7590", fontSize: 11, padding: 16, lineHeight: 1.6 }}>
        <strong style={{ color: "#9ca3b3" }}>DISCLAIMER:</strong> This pricing tool is provided for reference purposes only and does not constitute an official quotation, binding agreement, or contractual offer. Roadside Intelligence Network makes no representation regarding the accuracy, completeness, or reliability of any pricing estimates generated. Users accept full responsibility for all decisions made based on information from this tool. Roadside Intelligence Network disclaims all liability arising from reliance on any pricing data or estimates provided herein.
      </footer>
    </div>
  );
}

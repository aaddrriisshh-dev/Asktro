/**
 * Publish the Privacy Policy + Terms of Service + Disclaimer into the CMS
 * (`cms/{page}`), which the customer app renders under Settings. Editable later
 * in the admin portal without an app update.
 *
 *   node scripts/seed_legal.mjs            # dry run (prints what it will write)
 *   node scripts/seed_legal.mjs --yes      # write cms/privacy + cms/terms + cms/disclaimer
 *
 * Run from firebase/functions (needs serviceAccountKey.json or
 * GOOGLE_APPLICATION_CREDENTIALS pointing at the key).
 *
 * Real company details are filled in below (2026-07-20):
 *   Entity            Asktro Tech Private Limited (formerly XOBO Digitex Pvt Ltd)
 *   Registered office B-76, Sector 64, Gautam Buddha Nagar, Noida, UP 201301, India
 *   Grievance officer Sanjay Tyagi — grievance@asktro.in
 *   Support           support@asktro.in
 *   Effective date    20 July 2026 · Jurisdiction: Noida, UP
 * NOTE: legal counsel should still review before/soon after launch.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'serviceAccountKey.json';
let svc;
try {
  svc = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch {
  console.error(`\nCould not read ${keyPath}. Run from firebase/functions with a service-account key.\n`);
  process.exit(1);
}
initializeApp({ credential: cert(svc) });
const db = getFirestore();
const YES = process.argv.includes('--yes');

const PRIVACY = `ASKTRO — PRIVACY POLICY

Last updated: 20 July 2026

This Privacy Policy explains how Asktro Tech Private Limited ("Asktro", "we", "us" or "our") collects, uses, discloses and protects your information when you use the Asktro mobile application and related services (collectively, the "Platform"). Asktro provides astrology consultations and related content. By creating an account or using the Platform, you consent to the practices described in this Policy. If you do not agree, please do not use the Platform.

This Policy is published in accordance with the Digital Personal Data Protection Act, 2023, the Information Technology Act, 2000 and the rules made thereunder, including the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 and the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.

1. WHO WE ARE
Asktro Tech Private Limited is the data fiduciary responsible for your personal data processed through the Platform. Registered office: B-76, Sector 64, Gautam Buddha Nagar, Noida, Uttar Pradesh 201301, India. Contact: support@asktro.in.

2. INFORMATION WE COLLECT
(a) Information you give us:
   • Identity and contact details — name, mobile number, email address, and profile photo (if you add one).
   • Birth details — your date of birth, time of birth and place of birth, along with gender, relationship status and preferred languages. These are used to generate your astrological charts and readings and constitute sensitive personal data, which we process only with your consent.
   • Consultation content — the messages, questions and information you share during chat or call consultations with astrologers.
(b) Transaction information — wallet balance, recharge history, coupons applied, amounts charged per consultation, and payment status. Card, UPI and bank details are collected and processed directly by our payment gateway and are not stored by Asktro.
(c) Information collected automatically — device model, operating system, app version, IP address, language, approximate usage and diagnostic logs, and a push-notification token.
(d) Information from third parties — if you sign in with Google or Apple, we receive your basic profile (name, email, and a unique identifier) from that provider.

3. HOW WE USE YOUR INFORMATION
We use your information to: create and manage your account; generate astrological charts and personalised readings from your birth details; connect you with astrologers and enable chat and call consultations; operate the wallet, process recharges and bill consultations; apply promotions, referrals and coupons; send service messages and, where enabled, notifications; provide customer support and resolve grievances; detect, prevent and address fraud, abuse and security incidents; and comply with applicable law.

4. LEGAL BASIS AND CONSENT
We process your personal data on the basis of the consent you provide when you register and when you enter your birth details, and as necessary to provide the services you request, to comply with legal obligations, and for our legitimate interests in operating and securing the Platform. You may withdraw your consent at any time (see Section 9); withdrawal does not affect processing carried out before withdrawal, and may limit your ability to use certain features.

5. HOW WE SHARE INFORMATION
We do not sell your personal data. We share it only as follows:
   • Astrologers — to provide a consultation, the astrologer you connect with can see the information relevant to your reading (such as your name, birth details and the questions you ask). Astrologers are bound by confidentiality obligations.
   • Service providers — we use trusted providers to run the Platform: Google Firebase (authentication, database, hosting, notifications and infrastructure), our payment gateway Razorpay (payments and refunds), and Agora (voice and video calling). These providers process data on our behalf under contractual safeguards.
   • Legal and safety — we may disclose information to comply with law, court orders or lawful requests by public authorities, and to protect the rights, safety and property of Asktro, our users and the public.
   • Business transfers — if we are involved in a merger, acquisition or asset sale, your information may be transferred, subject to this Policy.

6. THIRD-PARTY SERVICES
The Platform relies on the following third parties, each governed by its own privacy policy: Google/Firebase, Razorpay and Agora. We encourage you to review their policies. We are not responsible for the privacy practices of third-party services we do not control.

7. DATA RETENTION
We retain your personal data for as long as your account is active or as needed to provide the services, and thereafter only as required to comply with legal, tax and regulatory obligations, resolve disputes and enforce our agreements. When data is no longer required, we delete or anonymise it.

8. DATA SECURITY
We implement reasonable security practices and procedures — including encryption in transit, access controls and authentication — designed to protect your information. No method of transmission or storage is completely secure, and we cannot guarantee absolute security. You are responsible for keeping your account credentials confidential.

9. YOUR RIGHTS AND CHOICES
Subject to applicable law, you may: access and review your personal data; correct or update inaccurate data (in-app via Edit Profile); withdraw consent; and request erasure of your account and data. You can delete your account directly in the app under Profile > Delete account, or by writing to us at support@asktro.in. On deletion, we remove your profile and personal data except where retention is legally required. You may also nominate another individual to exercise your rights in the event of death or incapacity as provided under the Digital Personal Data Protection Act, 2023.

10. CHILDREN
The Platform is intended only for individuals who are 18 years of age or older. We do not knowingly collect personal data from children. If we learn that we have collected data from a child, we will delete it. A parent or legal guardian may contact us to report such collection.

11. INTERNATIONAL DATA TRANSFERS
Our infrastructure providers may process and store data on servers located outside your state or country. Where data is transferred across borders, we take steps to ensure it is protected consistent with this Policy and applicable law.

12. CHANGES TO THIS POLICY
We may update this Policy from time to time. The "Last updated" date reflects the latest revision. Material changes will be notified through the app or by other reasonable means. Your continued use of the Platform after changes take effect constitutes acceptance.

13. GRIEVANCE OFFICER
In accordance with the Information Technology Act, 2000 and rules thereunder, the Grievance Officer for the Platform is:
   Name: Sanjay Tyagi
   Email: grievance@asktro.in
   Address: B-76, Sector 64, Gautam Buddha Nagar, Noida, Uttar Pradesh 201301, India
We will acknowledge your complaint within 24 hours and endeavour to resolve it within 15 days of receipt.

14. CONTACT US
For any questions about this Policy or your data, contact us at support@asktro.in.

© Asktro Tech Private Limited. All rights reserved.`;

const TERMS = `ASKTRO — TERMS OF SERVICE

Last updated: 20 July 2026

These Terms of Service ("Terms") are a legally binding agreement between you and Asktro Tech Private Limited ("Asktro", "we", "us" or "our") governing your access to and use of the Asktro mobile application and related services (the "Platform"). By creating an account or using the Platform, you agree to these Terms and to our Privacy Policy. If you do not agree, do not use the Platform.

1. ELIGIBILITY
You must be at least 18 years old and capable of forming a legally binding contract to use the Platform. By using the Platform, you represent and warrant that you meet these requirements and that the information you provide is accurate and complete.

2. THE SERVICE
Asktro connects you with astrologers and provides astrology-related consultations and content through chat and calls, along with tools such as horoscopes and birth charts. Consultations and content are provided for guidance, self-reflection and entertainment purposes only. They are NOT a substitute for professional advice — medical, psychological, legal, financial or otherwise. You should not rely on the Platform for decisions that require qualified professional judgement, and you use any guidance at your own discretion and risk.

3. ACCOUNTS
You are responsible for the activity that occurs under your account and for keeping your login credentials secure. You agree to provide accurate information, including birth details used to generate readings, and to keep it updated. We may suspend or terminate accounts that violate these Terms or that we reasonably believe are being used fraudulently or unlawfully.

4. WALLET, PRICING AND PAYMENTS
Consultations are paid from your in-app wallet. You add funds ("recharge") through our payment gateway, Razorpay. Chat and call consultations are billed on a per-minute basis at the rate displayed for each astrologer before you begin; billing is calculated by the second and deducted from your wallet in real time. You are responsible for maintaining sufficient balance; a consultation may pause or end when your balance is exhausted. Prices, rates and offers may change from time to time. Applicable taxes, if any, are your responsibility.

5. FREE MINUTES, PROMOTIONS AND REFERRALS
We may offer free minutes, promotional credits, coupons and referral rewards subject to eligibility conditions we set. These benefits carry no cash value, are non-transferable except as expressly permitted, and may be modified or withdrawn at any time. We may withhold or reverse benefits obtained through fraud, abuse or violation of these Terms.

6. REFUNDS
Wallet recharges are generally non-refundable once credited, except where required by law or expressly stated in a promotion. If you are wrongly charged due to a proven technical error on our part — for example, a failed connection for which you were billed — you may raise the issue with our support team, and we will review and, where appropriate, credit your wallet. Refund decisions are made at our reasonable discretion in accordance with applicable law.

7. USER CONDUCT
You agree not to: use the Platform for any unlawful, harmful, abusive, harassing, defamatory, obscene or fraudulent purpose; impersonate any person or misrepresent your identity; request or provide advice that is illegal or harmful; attempt to gain unauthorised access to the Platform, other accounts, or our systems; interfere with or disrupt the Platform; use bots, scrapers or automated means; or infringe the intellectual property or other rights of Asktro or any third party. Consultations must remain respectful; abusive behaviour toward astrologers or staff may result in immediate termination.

8. ASTROLOGERS
Astrologers on the Platform are independent practitioners who provide readings based on their own knowledge and interpretation. Asktro does not guarantee the accuracy, reliability or outcome of any reading, prediction or remedy, and does not endorse any particular astrologer's views. Any remedy, ritual or product suggested by an astrologer is a suggestion only, undertaken at your own discretion and risk.

9. INTELLECTUAL PROPERTY
The Platform, including its software, design, text, graphics, logos and content (excluding your own content), is owned by or licensed to Asktro and is protected by intellectual property laws. We grant you a limited, non-exclusive, non-transferable, revocable licence to use the Platform for personal, non-commercial purposes in accordance with these Terms. You may not copy, modify, distribute, sell or reverse-engineer any part of the Platform.

10. DISCLAIMERS
The Platform and all content are provided "as is" and "as available" without warranties of any kind, whether express or implied, including fitness for a particular purpose and accuracy. Astrological readings are inherently interpretive and subjective. We do not warrant that the Platform will be uninterrupted, error-free or secure.

11. LIMITATION OF LIABILITY
To the maximum extent permitted by law, Asktro and its directors, officers, employees and partners shall not be liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of profits, data, goodwill or other intangible losses, arising out of or relating to your use of the Platform. To the extent liability cannot be excluded, our total aggregate liability shall not exceed the amount you paid to Asktro in the ninety (90) days preceding the event giving rise to the claim.

12. INDEMNITY
You agree to indemnify and hold harmless Asktro and its personnel from any claims, damages, liabilities and expenses (including reasonable legal fees) arising out of your use of the Platform, your content, or your breach of these Terms or of any law or third-party right.

13. SUSPENSION AND TERMINATION
We may suspend or terminate your access to the Platform at any time, with or without notice, if you breach these Terms or where we are required to do so by law. You may stop using the Platform and delete your account at any time under Profile > Delete account. Provisions that by their nature should survive termination will survive.

14. GOVERNING LAW AND DISPUTES
These Terms are governed by the laws of India. Subject to applicable law, the courts at Noida, Uttar Pradesh, India shall have exclusive jurisdiction over any dispute arising out of or relating to these Terms or the Platform. Before initiating any formal proceeding, you agree to first contact us to seek an amicable resolution.

15. GRIEVANCE REDRESSAL
For complaints regarding content or these Terms, you may contact our Grievance Officer at grievance@asktro.in. We will acknowledge complaints within 24 hours and endeavour to resolve them within 15 days.

16. CHANGES TO THESE TERMS
We may update these Terms from time to time. Material changes will be notified through the app or by other reasonable means, and the "Last updated" date will be revised. Your continued use of the Platform after changes take effect constitutes acceptance of the revised Terms.

17. CONTACT
Questions about these Terms may be sent to support@asktro.in.

© Asktro Tech Private Limited. All rights reserved.`;

const DISCLAIMER = `ASKTRO — DISCLAIMER

Last updated: 20 July 2026

1. FOR GUIDANCE AND ENTERTAINMENT ONLY
All astrology content, readings, predictions, horoscopes, birth charts, remedies and consultations provided on the Asktro platform ("Platform") are intended for guidance, self-reflection and entertainment purposes only. They are NOT a substitute for professional advice of any kind — medical, psychological, psychiatric, legal, financial or otherwise. You should always seek the advice of a qualified professional for any such matters, and you should never disregard or delay seeking professional advice because of anything you read or hear on the Platform.

2. NO GUARANTEE OF ACCURACY OR OUTCOMES
Astrology is interpretive and subjective. Asktro does not warrant or guarantee the accuracy, reliability, completeness or usefulness of any reading, prediction, remedy or suggestion, and does not guarantee any particular result or outcome. Any reliance you place on such content is strictly at your own discretion and risk.

3. AI ASTROLOGER (AUTOMATED SERVICE)
Some consultations on the Platform are provided by an AI astrologer — an automated software service that generates responses algorithmically, without a human astrologer. Conversations with an AI astrologer are clearly identified as such. Responses are generated by artificial intelligence, are for entertainment purposes only, may be inaccurate or incomplete, and must not be relied upon for any personal, medical, legal, financial or other important decision. The AI does not provide professional advice and is not a licensed professional of any kind.

4. INDEPENDENT ASTROLOGERS
Human astrologers on the Platform are independent practitioners who provide readings based on their own knowledge and interpretation. Their views are their own and are not endorsed by Asktro. Any remedy, ritual, gemstone or product suggested is a suggestion only, undertaken at your own discretion and risk.

5. AGE
The Platform is intended only for individuals who are 18 years of age or older.

6. DECISIONS ARE YOUR OWN
You are solely responsible for the choices and decisions you make. Asktro and its astrologers accept no liability for any action taken, or not taken, on the basis of content or consultations obtained through the Platform, to the maximum extent permitted by law.

For questions about this Disclaimer, contact us at support@asktro.in.

© Asktro Tech Private Limited. All rights reserved.`;

async function main() {
  const pages = [
    { id: 'privacy', title: 'Privacy Policy', content: PRIVACY },
    { id: 'terms', title: 'Terms of Service', content: TERMS },
    { id: 'disclaimer', title: 'Disclaimer', content: DISCLAIMER },
  ];

  // Warn about unfilled placeholders.
  const missing = [];
  for (const p of pages) {
    const m = p.content.match(/\[[A-Z ]+\]/g);
    if (m) missing.push(...m);
  }
  const uniqMissing = [...new Set(missing)];
  if (uniqMissing.length) {
    console.log('\n⚠  Unfilled placeholders still present:', uniqMissing.join(', '));
    console.log('   Fill these in seed_legal.mjs before publishing the final version.\n');
  }

  for (const p of pages) {
    console.log(`${YES ? 'Writing' : 'Would write'} cms/${p.id}  (${p.content.length} chars, "${p.title}")`);
    if (YES) {
      await db.collection('cms').doc(p.id).set({
        content: p.content,
        title: p.title,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
  console.log(YES ? '\n✔ Published to CMS.\n' : '\n(dry run — pass --yes to publish)\n');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

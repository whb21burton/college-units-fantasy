import LegalPageLayout, { LegalSection } from '@/components/legal/LegalPageLayout';
import type { Section } from '@/components/legal/LegalPageLayout';

const sections: Section[] = [
  { id: 'overview', title: '1. Overview' },
  { id: 'collection', title: '2. Information We Collect' },
  { id: 'use', title: '3. How We Use Your Information' },
  { id: 'sharing', title: '4. Information Sharing' },
  { id: 'cookies', title: '5. Cookies & Tracking' },
  { id: 'security', title: '6. Data Security' },
  { id: 'retention', title: '7. Data Retention' },
  { id: 'rights', title: '8. Your Rights' },
  { id: 'children', title: '9. Children\'s Privacy' },
  { id: 'contact', title: '10. Contact Us' },
];

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="May 18, 2026" sections={sections}>
      <LegalSection id="overview" title="1. Overview">
        <p>College Units Fantasy ("CUF," "we," "our," "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Platform.</p>
        <p>By using CUF, you consent to the data practices described in this Privacy Policy. If you do not agree with this Policy, please do not use the Platform.</p>
        <p>This policy complies with applicable U.S. privacy laws, including the California Consumer Privacy Act (CCPA) for California residents.</p>
      </LegalSection>

      <LegalSection id="collection" title="2. Information We Collect">
        <p><strong>Information You Provide:</strong></p>
        <ul>
          <li>Account registration data: name, email address, date of birth</li>
          <li>Payment information: processed securely by our payment processor (we do not store full card numbers)</li>
          <li>Identity verification documents (when required for withdrawals or compliance)</li>
          <li>Communications you send to our support team</li>
          <li>Contest entries, draft picks, and gameplay decisions</li>
        </ul>
        <p><strong>Information We Collect Automatically:</strong></p>
        <ul>
          <li>IP address and approximate geolocation</li>
          <li>Device information (browser type, operating system, device identifiers)</li>
          <li>Usage data (pages visited, features used, time spent)</li>
          <li>Log data (errors, performance data, API calls)</li>
        </ul>
      </LegalSection>

      <LegalSection id="use" title="3. How We Use Your Information">
        <p>We use your information to:</p>
        <ul>
          <li>Provide, maintain, and improve the Platform</li>
          <li>Process transactions and manage your account balance</li>
          <li>Verify your identity and eligibility to participate in paid contests</li>
          <li>Comply with legal obligations, including tax reporting requirements</li>
          <li>Detect and prevent fraud, cheating, and abuse</li>
          <li>Send transactional emails (account confirmations, deposit/withdrawal notifications)</li>
          <li>Send promotional communications (only with your consent)</li>
          <li>Respond to customer support inquiries</li>
          <li>Analyze usage patterns to improve the user experience</li>
        </ul>
        <p>We do not sell your personal information to third parties for their marketing purposes.</p>
      </LegalSection>

      <LegalSection id="sharing" title="4. Information Sharing">
        <p>We may share your information with:</p>
        <ul>
          <li><strong>Service Providers:</strong> Third-party vendors who assist us in operating the Platform (database hosting, payment processing, email delivery). These providers are contractually obligated to protect your data.</li>
          <li><strong>Legal Compliance:</strong> When required by law, court order, or government authority, including to comply with IRS reporting requirements for gambling winnings.</li>
          <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, your information may be transferred to the new entity.</li>
          <li><strong>With Your Consent:</strong> Any other disclosures you specifically authorize.</li>
        </ul>
        <p>We do not share your contest entries or draft strategies with other users beyond what is publicly displayed in contest results.</p>
      </LegalSection>

      <LegalSection id="cookies" title="5. Cookies & Tracking">
        <p>We use cookies and similar tracking technologies to:</p>
        <ul>
          <li>Maintain your authentication session</li>
          <li>Remember your preferences</li>
          <li>Analyze Platform usage via privacy-respecting analytics</li>
        </ul>
        <p><strong>Types of Cookies:</strong></p>
        <ul>
          <li><em>Essential:</em> Required for Platform functionality (authentication, security). Cannot be disabled.</li>
          <li><em>Analytics:</em> Help us understand how users interact with the Platform. Can be disabled.</li>
          <li><em>Preference:</em> Store your settings and preferences. Can be disabled.</li>
        </ul>
        <p>You can control cookie settings through your browser. Note that disabling certain cookies may affect Platform functionality.</p>
      </LegalSection>

      <LegalSection id="security" title="6. Data Security">
        <p>We implement industry-standard security measures including:</p>
        <ul>
          <li>TLS/SSL encryption for all data in transit</li>
          <li>Database encryption at rest (AES-256)</li>
          <li>Row-level security (RLS) policies enforced at the database level</li>
          <li>Regular security audits and penetration testing</li>
          <li>Secure credential storage using bcrypt hashing</li>
        </ul>
        <p>No method of transmission over the Internet is 100% secure. We cannot guarantee absolute security but will notify you promptly of any security breach affecting your personal information, as required by applicable law.</p>
      </LegalSection>

      <LegalSection id="retention" title="7. Data Retention">
        <p>We retain your personal information for as long as your account is active or as needed to provide services. Specifically:</p>
        <ul>
          <li><strong>Account data:</strong> Retained while your account is active and for 7 years after closure (for tax/legal compliance)</li>
          <li><strong>Transaction records:</strong> Retained for 7 years per IRS requirements</li>
          <li><strong>Compliance logs:</strong> Retained for 5 years</li>
          <li><strong>Support communications:</strong> Retained for 3 years</li>
        </ul>
        <p>After the applicable retention period, we will securely delete or anonymize your data.</p>
      </LegalSection>

      <LegalSection id="rights" title="8. Your Rights">
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul>
          <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
          <li><strong>Correction:</strong> Request correction of inaccurate information</li>
          <li><strong>Deletion:</strong> Request deletion of your account and personal information (subject to legal retention requirements)</li>
          <li><strong>Portability:</strong> Receive your data in a machine-readable format</li>
          <li><strong>Opt-out:</strong> Unsubscribe from promotional communications at any time</li>
        </ul>
        <p><strong>California Residents (CCPA):</strong> You have additional rights under the CCPA, including the right to know what personal information is sold or disclosed and to opt-out of the sale of your personal information (we do not sell personal information).</p>
        <p>To exercise any of these rights, contact us via <a href="/support" style={{ color: '#d4a828' }}>our support form</a>.</p>
      </LegalSection>

      <LegalSection id="children" title="9. Children's Privacy">
        <p>CUF is intended for users aged 18 and older. We do not knowingly collect personal information from anyone under 18. If we become aware that we have collected data from a person under 18, we will promptly delete that information and close the account.</p>
        <p>If you believe a minor has created an account on our Platform, please contact us immediately via <a href="/support" style={{ color: '#d4a828' }}>our support form</a>.</p>
      </LegalSection>

      <LegalSection id="contact" title="10. Contact Us">
        <p>For questions about this Privacy Policy or your personal information, contact us at:</p>
        <p>
          <strong>College Units Fantasy — Privacy Team</strong><br />
          Contact: <a href="/support" style={{ color: '#d4a828' }}>collegeunitsfantasy.com/support</a><br />
          Response time: Within 30 days of receiving your request
        </p>
        <p>For California residents who wish to submit a CCPA request, please email us with the subject line "CCPA Request" and include your full name and email address associated with your account.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}

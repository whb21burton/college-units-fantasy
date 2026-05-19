import LegalPageLayout, { LegalSection } from '@/components/legal/LegalPageLayout';
import type { Section } from '@/components/legal/LegalPageLayout';

const sections: Section[] = [
  { id: 'commitment', title: '1. Our Commitment' },
  { id: 'tools', title: '2. Self-Management Tools' },
  { id: 'recognize', title: '3. Recognizing Problem Gambling' },
  { id: 'support', title: '4. Getting Help' },
  { id: 'minors', title: '5. Protecting Minors' },
  { id: 'resources', title: '6. External Resources' },
];

export default function ResponsibleGamingPage() {
  return (
    <LegalPageLayout
      title="Responsible Gaming"
      subtitle="Your wellbeing comes first. We're committed to providing a safe, fair, and enjoyable experience for all users."
      lastUpdated="May 18, 2026"
      sections={sections}
    >
      <div style={{ background: 'rgba(46,204,113,.08)', border: '1px solid rgba(46,204,113,.3)', borderRadius: 10, padding: '16px 20px', marginBottom: 32 }}>
        <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: 1, color: '#2ecc71', marginBottom: 6 }}>
          🛡️ NEED HELP NOW?
        </div>
        <div style={{ fontSize: 13, color: '#c8d4e8' }}>
          National Problem Gambling Helpline: <a href="tel:1-800-522-4700" style={{ color: '#2ecc71', fontWeight: 600 }}>1-800-522-4700</a> — Available 24/7, call or text
        </div>
      </div>

      <LegalSection id="commitment" title="1. Our Commitment">
        <p>College Units Fantasy is committed to responsible gaming. We believe that fantasy sports should be a fun, social activity — not a source of financial stress or harm.</p>
        <p>We operate under the principle that our long-term success depends on providing a safe and sustainable experience for all users. This means we actively work to:</p>
        <ul>
          <li>Provide tools that allow users to manage their play</li>
          <li>Make it easy to seek help if gaming becomes a problem</li>
          <li>Train our team to recognize and respond to problem gambling behaviors</li>
          <li>Exclude underage users from paid contests</li>
          <li>Cooperate fully with self-exclusion programs</li>
        </ul>
        <p>We adhere to the Fantasy Sports & Gaming Association (FSGA) standards and Responsible Fantasy Sports guidelines.</p>
      </LegalSection>

      <LegalSection id="tools" title="2. Self-Management Tools">
        <p>CUF provides the following tools to help you manage your fantasy sports activity. Access these in your Account Settings:</p>
        <p><strong>Deposit Limits:</strong> Set daily, weekly, or monthly limits on deposits to your CUF wallet. Once set, limits cannot be increased for 7 days to prevent impulsive decisions.</p>
        <p><strong>Entry Limits:</strong> Limit the total amount you can spend on contest entries per day, week, or month.</p>
        <p><strong>Reality Check:</strong> Receive periodic notifications reminding you how long you've been active and how much you've spent or won in the current session.</p>
        <p><strong>Cool-Off Period:</strong> Take a temporary break from the Platform for 24 hours, 7 days, or 30 days. During a cool-off period, you cannot enter new contests or make new deposits, but your account remains active.</p>
        <p><strong>Self-Exclusion:</strong> If you believe you have a gambling problem, you can permanently self-exclude from all paid contests on CUF. This action is irreversible for a minimum of 12 months. To self-exclude, contact us via <a href="/support" style={{ color: '#d4a828' }}>our support form</a>.</p>
      </LegalSection>

      <LegalSection id="recognize" title="3. Recognizing Problem Gambling">
        <p>Fantasy sports can become problematic when it stops being fun and starts causing negative consequences. Signs that your play may be becoming a problem include:</p>
        <ul>
          <li>Spending more money than you can afford to lose</li>
          <li>Borrowing money or selling possessions to fund your play</li>
          <li>Chasing losses — entering more contests to recoup previous losses</li>
          <li>Lying to family or friends about how much you play or spend</li>
          <li>Neglecting responsibilities (work, family, social) due to time spent playing</li>
          <li>Feeling anxious, irritable, or restless when not playing</li>
          <li>Using fantasy sports as an escape from problems or negative feelings</li>
          <li>Failed attempts to cut back or stop playing</li>
        </ul>
        <p>If you identify with any of these warning signs, please consider using our self-management tools or reaching out to a support organization listed below.</p>
      </LegalSection>

      <LegalSection id="support" title="4. Getting Help">
        <p>Asking for help is a sign of strength, not weakness. If you or someone you know may have a gambling problem, several resources are available:</p>
        <p><strong>National Problem Gambling Helpline:</strong> Call or text <a href="tel:1-800-522-4700" style={{ color: '#2ecc71' }}>1-800-522-4700</a>. Available 24/7. Confidential. Free. Connects you to local treatment resources.</p>
        <p><strong>Chat:</strong> Visit <a href="https://www.ncpgambling.org/chat" target="_blank" rel="noopener noreferrer" style={{ color: '#d4a828' }}>ncpgambling.org/chat</a> for live chat support.</p>
        <p><strong>Text:</strong> Text "HELPLINE" to 53342 for text-based support.</p>
        <p>If you would like CUF to restrict your account while you seek help, contact us via <a href="/support" style={{ color: '#d4a828' }}>our support form</a> and we will process your self-exclusion request within 24 hours.</p>
      </LegalSection>

      <LegalSection id="minors" title="5. Protecting Minors">
        <p>CUF strictly prohibits participation in paid contests by anyone under the age of 18. We employ multiple layers of protection:</p>
        <ul>
          <li>Age verification required during account registration</li>
          <li>Identity verification required before processing withdrawals</li>
          <li>Monitoring for accounts showing signs of minor activity</li>
        </ul>
        <p><strong>Parental Controls:</strong> If you share a device with minors, we strongly recommend using device-level parental controls or browser-based filtering to prevent access to the CUF platform.</p>
        <p>If you suspect a minor has created an account, please contact us immediately via <a href="/support" style={{ color: '#d4a828' }}>our support form</a>. We will investigate and close the account promptly.</p>
      </LegalSection>

      <LegalSection id="resources" title="6. External Resources">
        <p>The following organizations provide free, confidential support for problem gambling:</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
          {[
            {
              name: 'National Council on Problem Gambling (NCPG)',
              url: 'https://www.ncpgambling.org',
              phone: '1-800-522-4700',
              desc: 'National advocacy and referral organization. 24/7 helpline.',
            },
            {
              name: 'Gamblers Anonymous',
              url: 'https://www.gamblersanonymous.org',
              phone: null,
              desc: '12-step fellowship program for people with gambling problems. Find meetings near you.',
            },
            {
              name: 'National Alliance on Mental Illness (NAMI)',
              url: 'https://www.nami.org',
              phone: '1-800-950-6264',
              desc: 'Mental health support including co-occurring gambling and anxiety/depression.',
            },
            {
              name: 'Substance Abuse and Mental Health Services Administration (SAMHSA)',
              url: 'https://www.samhsa.gov',
              phone: '1-800-662-4357',
              desc: 'Federal agency with a national helpline for mental health and substance use disorders.',
            },
          ].map(r => (
            <div key={r.name} style={{ background: '#0c1220', border: '1px solid #1e2d47', borderRadius: 8, padding: '14px 16px' }}>
              <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: '#d4a828', fontWeight: 600, textDecoration: 'none', fontSize: 14 }}>
                {r.name}
              </a>
              {r.phone && (
                <a href={`tel:${r.phone}`} style={{ marginLeft: 12, color: '#2ecc71', fontSize: 13, textDecoration: 'none' }}>
                  {r.phone}
                </a>
              )}
              <p style={{ margin: '6px 0 0', color: '#7a90b0', fontSize: 13 }}>{r.desc}</p>
            </div>
          ))}
        </div>
      </LegalSection>
    </LegalPageLayout>
  );
}

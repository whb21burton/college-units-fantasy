import LegalPageLayout, { LegalSection } from '@/components/legal/LegalPageLayout';
import type { Section } from '@/components/legal/LegalPageLayout';

const sections: Section[] = [
  { id: 'acceptance', title: '1. Acceptance of Terms' },
  { id: 'eligibility', title: '2. Eligibility' },
  { id: 'account', title: '3. Account Registration' },
  { id: 'contests', title: '4. Fantasy Contests' },
  { id: 'payments', title: '5. Payments & Withdrawals' },
  { id: 'prohibited', title: '6. Prohibited Conduct' },
  { id: 'ip', title: '7. Intellectual Property' },
  { id: 'disclaimer', title: '8. Disclaimers' },
  { id: 'liability', title: '9. Limitation of Liability' },
  { id: 'changes', title: '10. Changes to Terms' },
];

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="May 18, 2026" sections={sections}>
      <LegalSection id="acceptance" title="1. Acceptance of Terms">
        <p>By accessing or using College Units Fantasy ("CUF," "we," "our," or "the Platform"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not access or use the Platform.</p>
        <p>These Terms constitute a legally binding agreement between you and College Units Fantasy. Your continued use of the Platform constitutes your ongoing acceptance of any changes to these Terms.</p>
        <p>By creating an account, you confirm that you have read, understood, and agreed to these Terms and our Privacy Policy, which is incorporated by reference herein.</p>
      </LegalSection>

      <LegalSection id="eligibility" title="2. Eligibility">
        <p>To use CUF and participate in paid contests, you must:</p>
        <ul>
          <li>Be at least 18 years of age (or the legal age of majority in your jurisdiction, whichever is higher)</li>
          <li>Be a legal resident of a U.S. state or territory where paid daily fantasy sports contests are permitted</li>
          <li>Not be an employee, contractor, or immediate family member of College Units Fantasy</li>
          <li>Not be a college athlete who is currently eligible for NCAA competition</li>
          <li>Have a valid Social Security Number or Individual Taxpayer Identification Number (required for winnings over IRS thresholds)</li>
        </ul>
        <p>Residents of certain states may be ineligible to participate in paid contests. Please review our <a href="/legal/state-restrictions" style={{ color: '#d4a828' }}>Eligible States</a> page. Free-to-play contests are available in all states unless prohibited by law.</p>
        <p>We reserve the right to verify your eligibility at any time and to suspend or terminate your account if you do not meet these requirements.</p>
      </LegalSection>

      <LegalSection id="account" title="3. Account Registration">
        <p>You must provide accurate, current, and complete information when creating your account. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account.</p>
        <p>You may not:</p>
        <ul>
          <li>Create more than one account per person</li>
          <li>Share your account with another person</li>
          <li>Transfer your account to another person</li>
          <li>Create an account on behalf of another person without their authorization</li>
        </ul>
        <p>You agree to notify us immediately of any unauthorized use of your account. CUF will not be liable for any loss resulting from unauthorized use of your account before you notify us.</p>
      </LegalSection>

      <LegalSection id="contests" title="4. Fantasy Contests">
        <p>CUF offers skill-based fantasy sports contests where participants draft college football "units" (offensive line, defensive line, etc.) and compete based on real-world statistical performance.</p>
        <p><strong>Skill-Based Determination:</strong> Our contests are games of skill, not chance. Outcomes are determined by the statistical performance of real college football players and the skill of participants in drafting and managing their teams.</p>
        <p><strong>Entry Fees:</strong> Contest entry fees are clearly displayed before you join. By entering a paid contest, you authorize us to deduct the entry fee from your account balance.</p>
        <p><strong>Prizes:</strong> Prize structures are displayed on each contest page. We retain a platform fee ("rake") of up to 5% of the total prize pool. Prizes are distributed according to the stated payout structure after contest completion.</p>
        <p><strong>Contest Cancellation:</strong> We reserve the right to cancel any contest if it does not reach the minimum number of participants, or due to technical issues. Full entry fee refunds will be issued for cancelled contests.</p>
      </LegalSection>

      <LegalSection id="payments" title="5. Payments & Withdrawals">
        <p><strong>Deposits:</strong> You may deposit funds into your CUF wallet using approved payment methods. All deposits are in U.S. dollars. We do not accept cryptocurrency.</p>
        <p><strong>Withdrawals:</strong> You may request withdrawal of available funds at any time. Withdrawals are processed within 3-5 business days. We may require identity verification before processing withdrawals.</p>
        <p><strong>Taxes:</strong> You are solely responsible for reporting and paying all applicable taxes on your winnings. We will issue IRS Form 1099 for annual net winnings exceeding $600. For single contest winnings of $600 or more where the winnings are 300x the entry fee, we are required to withhold 24% federal income tax.</p>
        <p><strong>Bonus Funds:</strong> Promotional bonus funds may have separate terms and conditions, including wagering requirements before withdrawal eligibility.</p>
      </LegalSection>

      <LegalSection id="prohibited" title="6. Prohibited Conduct">
        <p>You agree not to:</p>
        <ul>
          <li>Use bots, scripts, or automated tools to gain an unfair advantage</li>
          <li>Share or sell lineups, draft strategies, or insider information for compensation</li>
          <li>Engage in any form of collusion with other users</li>
          <li>Use multiple accounts to manipulate contest outcomes</li>
          <li>Attempt to hack, exploit, or reverse-engineer the Platform</li>
          <li>Post offensive, harassing, or illegal content</li>
          <li>Violate any applicable local, state, federal, or international law</li>
        </ul>
        <p>Violation of these rules may result in immediate account suspension, forfeiture of winnings, and/or legal action.</p>
      </LegalSection>

      <LegalSection id="ip" title="7. Intellectual Property">
        <p>All content, trademarks, logos, and software on the Platform are the property of College Units Fantasy or its licensors and are protected by applicable intellectual property laws.</p>
        <p>You are granted a limited, non-exclusive, non-transferable license to access and use the Platform for personal, non-commercial purposes. You may not reproduce, distribute, modify, or create derivative works without our written consent.</p>
        <p>College football statistical data is provided by licensed third-party data providers and is subject to their respective terms of use.</p>
      </LegalSection>

      <LegalSection id="disclaimer" title="8. Disclaimers">
        <p>THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.</p>
        <p>We do not guarantee that the Platform will be uninterrupted, error-free, or secure. We are not responsible for any loss of data, contest results, or other damages resulting from technical issues beyond our control.</p>
        <p>Fantasy sports involve real money and financial risk. Past performance does not guarantee future results. Only participate with funds you can afford to lose.</p>
      </LegalSection>

      <LegalSection id="liability" title="9. Limitation of Liability">
        <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL COLLEGE UNITS FANTASY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE PLATFORM.</p>
        <p>Our total liability to you for all claims arising from or related to these Terms or the Platform shall not exceed the amount you deposited in the 90 days preceding the claim.</p>
        <p>Some jurisdictions do not allow the exclusion of certain warranties or limitation of liability for consequential or incidental damages, so the above limitations may not apply to you.</p>
      </LegalSection>

      <LegalSection id="changes" title="10. Changes to Terms">
        <p>We may update these Terms at any time. We will notify you of material changes by posting the new Terms on the Platform and updating the "Last Updated" date. Your continued use of the Platform after the effective date of any changes constitutes acceptance of the new Terms.</p>
        <p>If you do not agree to the updated Terms, you must stop using the Platform and may request withdrawal of any available funds.</p>
        <p>For questions about these Terms, contact us at legal@collegeunitsfantasy.com.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}

import LegalPageLayout, { LegalSection } from '@/components/legal/LegalPageLayout';
import type { Section } from '@/components/legal/LegalPageLayout';

const sections: Section[] = [
  { id: 'overview', title: '1. Contest Overview' },
  { id: 'entry', title: '2. Entry Requirements' },
  { id: 'scoring', title: '3. Scoring Rules' },
  { id: 'draft', title: '4. Draft Rules' },
  { id: 'prizes', title: '5. Prize Structure' },
  { id: 'results', title: '6. Results & Settlement' },
  { id: 'disputes', title: '7. Disputes' },
  { id: 'integrity', title: '8. Contest Integrity' },
  { id: 'modifications', title: '9. Modifications & Cancellations' },
];

export default function ContestRulesPage() {
  return (
    <LegalPageLayout title="Contest Rules" lastUpdated="May 18, 2026" sections={sections}>
      <LegalSection id="overview" title="1. Contest Overview">
        <p>College Units Fantasy offers skill-based fantasy football contests centered on college football "units" — cohesive groups of players that operate together on the field (offensive line, defensive line, wide receivers, linebackers, etc.).</p>
        <p>Unlike traditional fantasy sports, CUF scoring is based on the collective performance of unit groups, not individual player stats. This creates a unique, strategy-driven format that rewards deep knowledge of college football.</p>
        <p>CUF offers two primary contest formats:</p>
        <ul>
          <li><strong>Weekly Pick'em:</strong> Draft units for a single week of games. Results are finalized 48 hours after the last game of the week concludes.</li>
          <li><strong>Season-Long Leagues:</strong> Manage a roster of units across the full college football season. Scoring accumulates over the entire season.</li>
          <li><strong>Bracket Contests:</strong> Pick winning teams in a bracket format. Scored based on correct picks advancing through the tournament.</li>
        </ul>
      </LegalSection>

      <LegalSection id="entry" title="2. Entry Requirements">
        <p>To enter a paid contest, you must:</p>
        <ul>
          <li>Have a verified CUF account (18+ age confirmed)</li>
          <li>Be located in an eligible state at the time of entry</li>
          <li>Have sufficient funds in your CUF wallet to cover the entry fee</li>
          <li>Complete your draft or bracket selections before the contest lock time</li>
        </ul>
        <p><strong>Contest Lock:</strong> All contests lock when the first game of the contest period begins. No changes to lineups or picks may be made after lock. It is your responsibility to submit entries before the deadline.</p>
        <p><strong>Entry Limits:</strong> Each contest may specify a maximum number of entries per user. These limits are displayed on the contest page and enforced at time of entry.</p>
      </LegalSection>

      <LegalSection id="scoring" title="3. Scoring Rules">
        <p><strong>Unit Scoring (Weekly & Season Leagues):</strong></p>
        <p>Units are scored based on the aggregate performance of all players in that unit during the contest period. Scoring categories include:</p>
        <ul>
          <li>Offensive Line: Rushing yards allowed per carry (inverse), sacks allowed (negative), rushing touchdowns blocked</li>
          <li>Wide Receivers: Receiving yards, receptions, touchdowns, yards after catch</li>
          <li>Defensive Line: Sacks, tackles for loss, quarterback hurries, forced fumbles</li>
          <li>Linebackers: Total tackles, sacks, interceptions, pass deflections</li>
          <li>Secondary: Pass deflections, interceptions, touchdowns allowed (inverse), yards allowed (inverse)</li>
          <li>Quarterbacks: Passing yards, touchdowns, completion percentage, interceptions (negative)</li>
          <li>Running Backs: Rushing yards, touchdowns, yards per carry, receptions</li>
          <li>Special Teams: Field goals made/attempted, punt/kick return yards, touchdowns</li>
        </ul>
        <p><strong>Bracket Scoring:</strong> 1 point per correct pick in the first round. Points double each subsequent round.</p>
        <p>Official scoring data is sourced from our licensed data provider. In the event of a data discrepancy, we will make every reasonable effort to correct the issue within 72 hours of final game completion.</p>
      </LegalSection>

      <LegalSection id="draft" title="4. Draft Rules">
        <p><strong>Draft Format:</strong> CUF uses a snake draft format for season-long leagues. Weekly contests use a "salary cap" draft where each unit is assigned a cost and you must build a roster within your budget.</p>
        <p><strong>Draft Order:</strong> For season-long leagues, draft order is randomized prior to the draft. All participants are notified of their pick order before the draft begins.</p>
        <p><strong>Auto-Pick:</strong> If you miss your pick window during a live draft, the system will automatically select the highest-value available unit based on our rankings algorithm. Repeated missed picks may result in your removal from the draft queue.</p>
        <p><strong>Trade Deadline:</strong> Season-long leagues may allow unit trades between members, subject to commissioner approval. The trade deadline is set by the commissioner and is typically two weeks before the playoff round begins.</p>
      </LegalSection>

      <LegalSection id="prizes" title="5. Prize Structure">
        <p>All contest prize pools are calculated based on actual entries received. Prize structures are displayed on each contest page and include:</p>
        <ul>
          <li><strong>Winner Take All:</strong> 100% of the net prize pool to the top scorer. Suitable for smaller contests.</li>
          <li><strong>Top 2:</strong> 70% to 1st place, 30% to 2nd place.</li>
          <li><strong>Top 3:</strong> 60% to 1st place, 25% to 2nd, 15% to 3rd.</li>
          <li><strong>Double Up:</strong> Top 50% of entrants double their entry fee (minus rake).</li>
        </ul>
        <p><strong>Platform Fee (Rake):</strong> CUF retains up to 5% of the total prize pool as a platform fee. The net prize pool (after rake) is displayed on all contest pages before you enter.</p>
        <p>Prize amounts shown are estimates based on current entry counts and may change until the contest locks.</p>
      </LegalSection>

      <LegalSection id="results" title="6. Results & Settlement">
        <p>Contest results are finalized after all relevant games have concluded and official statistics have been verified. Final settlement timelines:</p>
        <ul>
          <li><strong>Weekly contests:</strong> Settled within 48 hours of the last game of the week</li>
          <li><strong>Season leagues:</strong> Final standings settled within 7 days of the last regular season/playoff game</li>
          <li><strong>Bracket contests:</strong> Settled within 24 hours of the final game</li>
        </ul>
        <p>Prize funds are credited to your CUF wallet upon settlement. You will receive an email notification when prizes are awarded.</p>
        <p>In the event of a tie at any prize position, the prize money for that position and the next position(s) will be combined and split equally among tied participants.</p>
      </LegalSection>

      <LegalSection id="disputes" title="7. Disputes">
        <p>If you believe there is an error in contest results or scoring, you must submit a dispute within 72 hours of contest settlement via <a href="/support" style={{ color: '#d4a828' }}>our support form</a> with:</p>
        <ul>
          <li>Your account email address</li>
          <li>The contest ID</li>
          <li>A clear description of the perceived error</li>
          <li>Supporting evidence (official box scores, news sources, etc.)</li>
        </ul>
        <p>We will review all disputes within 5 business days and notify you of our decision. CUF's determination on all scoring disputes is final.</p>
        <p>Refunds will only be issued for disputes that result in a material change to contest results. Minor statistical corrections that do not affect the prize distribution will not trigger refunds.</p>
      </LegalSection>

      <LegalSection id="integrity" title="8. Contest Integrity">
        <p>CUF is committed to maintaining fair, competitive contests. We employ automated and manual systems to detect:</p>
        <ul>
          <li>Multi-accounting (creating multiple accounts to gain an advantage)</li>
          <li>Use of automated scripts, bots, or third-party tools to submit entries</li>
          <li>Collusion between users to manipulate contest results</li>
          <li>Use of material non-public information (e.g., undisclosed injury reports)</li>
          <li>Any other conduct that undermines fair competition</li>
        </ul>
        <p>Accounts found to be engaged in contest manipulation will be immediately suspended. Any winnings obtained through manipulation will be forfeited and the affected users may be permanently banned from the Platform.</p>
        <p>We reserve the right to withhold prize payment pending investigation of any suspected violation.</p>
      </LegalSection>

      <LegalSection id="modifications" title="9. Modifications & Cancellations">
        <p><strong>Game Cancellations:</strong> If a game included in a weekly contest is cancelled, postponed beyond the settlement window, or officially declared a no-contest, those game's stats will be excluded from scoring. If a cancellation materially reduces the contest's competitiveness, we may issue full refunds at our discretion.</p>
        <p><strong>Contest Cancellation Due to Low Entries:</strong> Some contests require a minimum number of entries to run. If this minimum is not reached by the contest lock time, the contest will be cancelled and all entry fees refunded in full.</p>
        <p><strong>Force Majeure:</strong> CUF is not responsible for contest interruptions or cancellations due to events beyond our reasonable control, including natural disasters, government actions, or infrastructure failures. In such cases, we will make commercially reasonable efforts to refund entry fees.</p>
        <p>Rule modifications will be communicated to participants at least 24 hours before they take effect for any active contest.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}

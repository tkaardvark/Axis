// 2025-26 NAIA Men's Basketball National Tournament Bracket
// Source: https://www.naia.org/sports/mbkb/2025-26/releases/2026_FirstSecondRoundSchedule
// First & Second Round: March 13-14, 2026 at 16 campus host sites
// Final Site: March 19-24, 2026 — Municipal Auditorium, Kansas City, Mo.

const TOURNAMENT_BRACKET_2026 = {
  league: 'mens',
  season: '2025-26',
  finalSite: { venue: 'Municipal Auditorium', city: 'Kansas City', state: 'MO' },
  quadrants: [
    {
      name: 'Naismith',
      pods: [
        {
          hostCity: 'Henderson', hostState: 'TN',
          teams: [
            { seed: 1, teamId: 'hmcw41yt8m3d5y44', name: 'Freed-Hardeman (Tenn.)', isHost: true },
            { seed: 8, teamId: 'wfqjmdwoeo58fa47', name: 'Loyola (La.)' },
            { seed: 9, teamId: 'bl47efa0glj0zmue', name: 'Bethel (KS)' },
            { seed: 16, teamId: 'dvmp3rr75rgtxrw9', name: 'Governors State' },
          ],
        },
        {
          hostCity: 'Orange City', hostState: 'IA',
          teams: [
            { seed: 4, teamId: '4g0zrgsx4eanwzva', name: 'Northwestern (Iowa)', isHost: true },
            { seed: 5, teamId: 'ci4gzidycr9cbsbq', name: 'William Penn (Iowa)' },
            { seed: 12, teamId: 'db0ocqt24jqbpo76', name: 'College of Idaho' },
            { seed: 13, teamId: 'iambvjvkjvialb3w', name: 'Taylor (IN)' },
          ],
        },
        {
          hostCity: 'Georgetown', hostState: 'KY',
          teams: [
            { seed: 3, teamId: 'h3kiwmeldhpglx7o', name: 'Georgetown (Ky.)', isHost: true },
            { seed: 6, teamId: '7u7tydym5kw8vgne', name: 'Bethel (IN)' },
            { seed: 11, teamId: 'zat50y27gopqtcv5', name: 'Life' },
            { seed: 14, teamId: '1i4s600e87bsh1vs', name: 'IU Kokomo' },
          ],
        },
        {
          hostCity: 'Chandler', hostState: 'AZ',
          teams: [
            { seed: 2, teamId: 'mj2jzlie86kqqjfv', name: 'Arizona Christian', isHost: true },
            { seed: 7, teamId: '3x8t8ahwr13r0vwj', name: 'Wayland Baptist (TX)' },
            { seed: 10, teamId: 's5w0ikcfp4osc5od', name: 'Carroll (MT)' },
            { seed: 15, teamId: 'hml1eb7m23h3pksr', name: 'Corban' },
          ],
        },
      ],
    },
    {
      name: 'Cramer',
      pods: [
        {
          hostCity: 'Waxahachie', hostState: 'TX',
          teams: [
            { seed: 1, teamId: 'l2dqd37dh6eozgcz', name: 'Nelson (Texas)', isHost: true },
            { seed: 8, teamId: '486kvd9iv9ga7ezc', name: 'Benedictine Mesa' },
            { seed: 9, teamId: 'a9cduznzwz3ioaoo', name: 'Southwestern' },
            { seed: 16, teamId: '7l9ihuwjwn3g24pe', name: 'Arkansas Baptist' },
          ],
        },
        {
          hostCity: 'Columbia', hostState: 'MO',
          teams: [
            { seed: 4, teamId: 'jfob75mngwchxn6r', name: 'Columbia (MO)', isHost: true },
            { seed: 5, teamId: 'l0wfhgjlkz1qs129', name: 'Pikeville (KY)' },
            { seed: 12, teamId: 'tftbd10epjl5b2ha', name: 'Faulkner (AL)' },
            { seed: 13, teamId: 'e0dd343b3klwxep0', name: 'McPherson (Kan.)' },
          ],
        },
        {
          hostCity: 'Fullerton', hostState: 'CA',
          teams: [
            { seed: 3, teamId: 'dbvbam43zj2ks2uw', name: 'Hope International', isHost: true },
            { seed: 6, teamId: '4yjjw0qxsvoxe37c', name: 'Keiser (Fla.)' },
            { seed: 11, teamId: 'glex7xc1edjxqqti', name: 'Oregon Tech' },
            { seed: 14, teamId: '1w7l5fh2ro2pq80d', name: 'Georgia Gwinnett' },
          ],
        },
        {
          hostCity: 'Marion', hostState: 'IN',
          teams: [
            { seed: 2, teamId: 'spqmnrkrosxy3wl6', name: 'Indiana Wesleyan', isHost: true },
            { seed: 7, teamId: 'fq5siklmy76j16jq', name: 'Shawnee State' },
            { seed: 10, teamId: 'tqpghxcimfdyunt0', name: 'Dalton State (GA)' },
            { seed: 15, teamId: '63h35y5emmkooyyb', name: 'St. Francis (IL)' },
          ],
        },
      ],
    },
    {
      name: 'Duer',
      pods: [
        {
          hostCity: 'Winona Lake', hostState: 'IN',
          teams: [
            { seed: 1, teamId: 'gjjg68o96u18nogw', name: 'Grace (Ind.)', isHost: true },
            { seed: 8, teamId: 'eiektnnaspy4k666', name: 'Madonna (Mich.)' },
            { seed: 9, teamId: '25ijxjj58mjj7w7z', name: 'Southeastern (Fla.)' },
            { seed: 16, teamId: '5xugxzd80hj0yy4f', name: 'Johnson (TN)' },
          ],
        },
        {
          hostCity: 'Williamsburg', hostState: 'KY',
          teams: [
            { seed: 4, teamId: 'auzmae0rtl9b2sh0', name: 'Cumberlands (Ky.)', isHost: true },
            { seed: 5, teamId: '5to5y724dgfo3j59', name: 'William Carey (Miss.)' },
            { seed: 12, teamId: 'xwz4aj2jzvy74ila', name: 'Xavier (La.)' },
            { seed: 13, teamId: 'hf41a2jfj8j6zem2', name: 'Indiana Tech' },
          ],
        },
        {
          hostCity: 'Wichita', hostState: 'KS',
          teams: [
            { seed: 3, teamId: 'zom3pu92g0fwoefg', name: 'Ave Maria', isHost: true },
            { seed: 6, teamId: 'pigh2azxv2g2na3m', name: 'Friends (KS)' },
            { seed: 11, teamId: '4m7tmp4pdsr01wp4', name: 'Indiana Southeast' },
            { seed: 14, teamId: '3tlj554w7rig6aeq', name: 'Texas A&M Texarkana' },
          ],
        },
        {
          hostCity: 'Shreveport', hostState: 'LA',
          teams: [
            { seed: 2, teamId: 'ijwx8dugstqdl54t', name: 'LSU Shreveport (La.)', isHost: true },
            { seed: 7, teamId: 'nlcz0jr74guoa7l4', name: 'Morningside (Iowa)' },
            { seed: 10, teamId: '45r2o650be2k9mn0', name: 'Texas Wesleyan' },
            { seed: 15, teamId: 'abogeougpfzedvwc', name: 'Tougaloo (Miss.)' },
          ],
        },
      ],
    },
    {
      name: 'Liston',
      pods: [
        {
          hostCity: 'Bartlesville', hostState: 'OK',
          teams: [
            { seed: 1, teamId: 'efs4o5zdke8jwo0h', name: 'Oklahoma Wesleyan', isHost: true },
            { seed: 8, teamId: 'asqnmmyyx9z23nqq', name: 'Montana Tech (MT)' },
            { seed: 9, teamId: '344tf8hkeac474c4', name: 'Oklahoma City' },
            { seed: 16, teamId: 'hlslsodm50mscquz', name: 'Southern University at New Orleans (LA)' },
          ],
        },
        {
          hostCity: 'Langston', hostState: 'OK',
          teams: [
            { seed: 4, teamId: 'cdswbsgoroi8a0sx', name: 'Langston (Okla.)', isHost: true },
            { seed: 5, teamId: 'f7vdk622ylei701c', name: 'LSU Alexandria (La.)' },
            { seed: 12, teamId: 'cqn1jowy3zt1f1wo', name: 'Eastern Oregon' },
            { seed: 13, teamId: '42fzri4ognkt6zfk', name: 'Bethel (TN)' },
          ],
        },
        {
          hostCity: 'Huntington', hostState: 'IN',
          teams: [
            { seed: 3, teamId: 'crxtcevs70wpxd3b', name: 'Huntington (IN)', isHost: true },
            { seed: 6, teamId: 'ypq5ma33k0uyfmge', name: 'Graceland' },
            { seed: 11, teamId: 'g6l3lnxglh0ewxm4', name: 'Lindsey Wilson (Ky.)' },
            { seed: 14, teamId: 'g8zy9rkqpps1iz5b', name: 'Bellevue (NE)' },
          ],
        },
        {
          hostCity: 'Billings', hostState: 'MT',
          teams: [
            { seed: 2, teamId: 'h103cz86ixt3vlot', name: 'Rocky Mountain (MT)', isHost: true },
            { seed: 7, teamId: 'wrn2r9ihgljpn5vs', name: 'Lewis-Clark State (Idaho)' },
            { seed: 10, teamId: '83uwy2g5e3ppxzgj', name: 'The Master\'s (Calif.)' },
            { seed: 15, teamId: '9x85ibmg2byl5bc6', name: 'Simpson (CA)' },
          ],
        },
      ],
    },
  ],
};

module.exports = { TOURNAMENT_BRACKET_2026 };

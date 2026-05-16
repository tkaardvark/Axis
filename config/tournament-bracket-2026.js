// 2025-26 NAIA Basketball National Tournament Brackets
// Men's source: https://www.naia.org/sports/mbkb/2025-26/releases/2026_FirstSecondRoundSchedule
// Men's First & Second Round: March 13-14, 2026 — 16 campus host sites
// Men's Final Site: March 19-24, 2026 — Municipal Auditorium, Kansas City, Mo.
// Women's source: https://www.naia.org/sports/wbkb/2025-26/releases/first_second_rounds
// Women's First & Second Round: March 13-14, 2026 — 16 campus host sites
// Women's Final Site: March 19-24, 2026 — Tyson Events Center, Sioux City, Iowa

const MENS_BRACKET_2026 = {
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

const WOMENS_BRACKET_2026 = {
  league: 'womens',
  season: '2025-26',
  finalSite: { venue: 'Tyson Events Center', city: 'Sioux City', state: 'IA' },
  quadrants: [
    {
      name: 'Naismith',
      pods: [
        {
          hostCity: 'Henderson', hostState: 'TN',
          teams: [
            { seed: 1, teamId: 'c7bnmn8pp4ijo75f', name: 'Freed-Hardeman (Tenn.)', isHost: true },
            { seed: 8, teamId: '0tek7u332b0uuqzv', name: 'Langston (Okla.)' },
            { seed: 9, teamId: 'dp5qzm33lizp2hvn', name: 'Bethel (IN)' },
            { seed: 16, teamId: '2llz9qw4npjdo92x', name: 'Rust (MS)' },
          ],
        },
        {
          hostCity: 'Georgetown', hostState: 'KY',
          teams: [
            { seed: 4, teamId: '4ilifr8nda7ga250', name: 'Loyola (La.)' },
            { seed: 5, teamId: 'c5zu62995b7qg2u8', name: 'Georgetown (Ky.)', isHost: true },
            { seed: 12, teamId: 'zzc7ve1sptvpu4ru', name: 'Taylor (IN)' },
            { seed: 13, teamId: 'm6w366z8azvg614b', name: 'Milligan (TN)' },
          ],
        },
        {
          hostCity: 'Madison', hostState: 'SD',
          teams: [
            { seed: 3, teamId: '6igzqg2748q32vig', name: 'Dakota State (SD)', isHost: true },
            { seed: 6, teamId: '6amu3ufmucj59w4v', name: 'Concordia (Neb.)' },
            { seed: 11, teamId: 'djck9rfucqtwj6fl', name: 'Bethel (KS)' },
            { seed: 14, teamId: '2u3ejp7dij4kbufz', name: 'Grand View' },
          ],
        },
        {
          hostCity: 'Rio Grande', hostState: 'OH',
          teams: [
            { seed: 2, teamId: 'n3hn2v6e22mjz3n0', name: 'Rio Grande', isHost: true },
            { seed: 7, teamId: 'tsxsx8gblkdgbnji', name: 'Cumberlands (Ky.)' },
            { seed: 10, teamId: 'vs9u0neepudukcfj', name: 'Indiana Wesleyan' },
            { seed: 15, teamId: 'uz5crbugiizro8c8', name: 'Rochester Christian (Mich.)' },
          ],
        },
      ],
    },
    {
      name: 'Cramer',
      pods: [
        {
          hostCity: 'Sioux Center', hostState: 'IA',
          teams: [
            { seed: 1, teamId: 'j2zfm7ktaeuaglpp', name: 'Dordt (IA)', isHost: true },
            { seed: 8, teamId: 'd8ohsh9hyqobnrlw', name: 'Rocky Mountain (MT)' },
            { seed: 9, teamId: '2ykxuhnknwofstb8', name: 'Southern Oregon' },
            { seed: 16, teamId: 'awh6kvacidaff2b6', name: 'Simpson (CA)' },
          ],
        },
        {
          hostCity: 'Olathe', hostState: 'KS',
          teams: [
            { seed: 4, teamId: 'wn9oyala1gpxeo71', name: 'MidAmerica Nazarene', isHost: true },
            { seed: 5, teamId: 'x8ccpntrjdpgu6sw', name: 'Mid-America Christian' },
            { seed: 12, teamId: 'lusu14jcwuvc7bea', name: 'Olivet Nazarene (IL)' },
            { seed: 13, teamId: 'bz5zqt91t431s5bm', name: 'Saint Mary' },
          ],
        },
        {
          hostCity: 'Wichita', hostState: 'KS',
          teams: [
            { seed: 3, teamId: 'udflh1dsk8rtikmj', name: 'Corban' },
            { seed: 6, teamId: 'y7cr322lxmtssgp0', name: 'Friends (KS)', isHost: true },
            { seed: 11, teamId: 'tqq164vczfk6a62b', name: 'Hastings' },
            { seed: 14, teamId: '14rfm22dqf3ezw3u', name: 'Texas A&M-San Antonio' },
          ],
        },
        {
          hostCity: 'Fort Wayne', hostState: 'IN',
          teams: [
            { seed: 2, teamId: '6rwxo5gh0ootmxbf', name: 'Saint Francis (Ind.)', isHost: true },
            { seed: 7, teamId: 'l6lm4xz2mwoedqcv', name: 'College of Idaho' },
            { seed: 10, teamId: 'lv7owbxfknmou2w7', name: 'Briar Cliff (IA)' },
            { seed: 15, teamId: 'gp0x54zcikrnfth0', name: 'Brescia (KY)' },
          ],
        },
      ],
    },
    {
      name: 'Duer',
      pods: [
        {
          hostCity: 'McKenzie', hostState: 'TN',
          teams: [
            { seed: 1, teamId: '0n1zdxeitclcmvq3', name: 'Bethel (TN)', isHost: true },
            { seed: 8, teamId: 'ni9wzrq3sx9lefe5', name: 'Oregon Tech' },
            { seed: 9, teamId: 'mftryticdos1hd2l', name: 'Huntington (IN)' },
            { seed: 16, teamId: 'zq719u6b3wy4vlgw', name: 'Talladega (AL)' },
          ],
        },
        {
          hostCity: 'Lewiston', hostState: 'ID',
          teams: [
            { seed: 4, teamId: 'u35j8b4xwu5akz83', name: 'Lewis-Clark State (Idaho)', isHost: true },
            { seed: 5, teamId: '4qotvn0z71lqa5hp', name: 'Montana Tech (MT)' },
            { seed: 12, teamId: 'bck9b05w5kmx4qvm', name: 'Nelson (Texas)' },
            { seed: 13, teamId: '3q7tv7bc7d1irtpq', name: 'Hope International' },
          ],
        },
        {
          hostCity: 'Montgomery', hostState: 'AL',
          teams: [
            { seed: 3, teamId: 'sj7ydjb98nb8xpdm', name: 'Lindsey Wilson (Ky.)' },
            { seed: 6, teamId: 'jf3i9mxmjrl46ttd', name: 'Southeastern (Fla.)' },
            { seed: 11, teamId: 'rthk2jhd2f8tz9ik', name: 'Faulkner (AL)', isHost: true },
            { seed: 14, teamId: '0ycub62mzt1a90oh', name: 'Williams Baptist (AR)' },
          ],
        },
        {
          hostCity: 'Mitchell', hostState: 'SD',
          teams: [
            { seed: 2, teamId: 'cgcx8lw4cs91xe57', name: 'Dakota Wesleyan (SD)', isHost: true },
            { seed: 7, teamId: 'wao8h3zjhieoxyha', name: 'Eastern Oregon' },
            { seed: 10, teamId: '74uxb7vb8cbga6il', name: 'College of the Ozarks' },
            { seed: 15, teamId: '2z5l43ux1e0fzncc', name: 'St. Francis (IL)' },
          ],
        },
      ],
    },
    {
      name: 'Liston',
      pods: [
        {
          hostCity: 'Indianapolis', hostState: 'IN',
          teams: [
            { seed: 1, teamId: 'axpljvjmqixkdirg', name: 'Marian', isHost: true },
            { seed: 8, teamId: 'l50dns86ejudpaqf', name: 'Columbia (MO)' },
            { seed: 9, teamId: 'uliqby2p6mtgfp6n', name: 'Carroll (MT)' },
            { seed: 16, teamId: 'tk7f2ume2mw8bbja', name: 'Haskell Indian Nations University' },
          ],
        },
        {
          hostCity: 'Springfield', hostState: 'MO',
          teams: [
            { seed: 4, teamId: 'feztkdtjhc4v4ky7', name: 'Evangel (Mo.)', isHost: true },
            { seed: 5, teamId: 'l2emooh7bhkw9e6a', name: 'William Carey (Miss.)' },
            { seed: 12, teamId: 'm2di2owrsqq0j2cr', name: 'Shawnee State' },
            { seed: 13, teamId: 'x141i78yaea7l20d', name: 'Science and Arts' },
          ],
        },
        {
          hostCity: 'Spring Arbor', hostState: 'MI',
          teams: [
            { seed: 3, teamId: 'w5j53m7dmyyi2w7w', name: 'Tennessee Southern' },
            { seed: 6, teamId: '50vxa1n92ov2gx2w', name: 'Spring Arbor (Mich.)', isHost: true },
            { seed: 11, teamId: 'accvixepz7s2scba', name: 'Indiana Tech' },
            { seed: 14, teamId: 'nzsl2cfwol85r3kv', name: 'Northwestern (Iowa)' },
          ],
        },
        {
          hostCity: 'Campbellsville', hostState: 'KY',
          teams: [
            { seed: 2, teamId: 'ei1mkh9jrjn3yub5', name: 'Campbellsville (KY)', isHost: true },
            { seed: 7, teamId: 'c8rpxq19afcjcpzd', name: 'LSU Shreveport (La.)' },
            { seed: 10, teamId: 'aohu0b7rbfp98v6o', name: 'Benedictine (KS)' },
            { seed: 15, teamId: 'ayi36p4si00t0hv0', name: 'Bryan (TN)' },
          ],
        },
      ],
    },
  ],
};

module.exports = {
  MENS_BRACKET_2026,
  WOMENS_BRACKET_2026,
  // Backward-compat alias (men's bracket was the original export)
  TOURNAMENT_BRACKET_2026: MENS_BRACKET_2026,
  getBracket({ league, season }) {
    if (season !== '2025-26') return null;
    if (league === 'womens') return WOMENS_BRACKET_2026;
    if (league === 'mens') return MENS_BRACKET_2026;
    return null;
  },
};

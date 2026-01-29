/**
 * NAIA Team Location Data
 *
 * Maps team names to their city and state.
 * This data is used for geographic bracket pod assignment.
 *
 * Source: NAIA Member Institutions Map (https://www.naia.org/schools/membership-map)
 * and official NAIA member institution list.
 */

const teamLocations = {
  // ALABAMA
  "Faulkner (AL)": { city: "Montgomery", state: "AL" },
  "Mobile (Ala.)": { city: "Mobile", state: "AL" },
  "Oakwood (AL)": { city: "Huntsville", state: "AL" },
  "Stillman": { city: "Tuscaloosa", state: "AL" },
  "Talladega (AL)": { city: "Talladega", state: "AL" },

  // ARIZONA
  "Arizona Christian": { city: "Glendale", state: "AZ" },
  "Benedictine Mesa": { city: "Mesa", state: "AZ" },
  "Embry-Riddle (AZ)": { city: "Prescott", state: "AZ" },
  "OUAZ": { city: "Surprise", state: "AZ" },
  "Park-Gilbert (AZ)": { city: "Gilbert", state: "AZ" },

  // ARKANSAS
  "Arkansas Baptist": { city: "Little Rock", state: "AR" },
  "Central Baptist (Ark.)": { city: "Conway", state: "AR" },
  "Crowley's Ridge (AR)": { city: "Paragould", state: "AR" },
  "Philander Smith (AR)": { city: "Little Rock", state: "AR" },
  "Williams Baptist (AR)": { city: "Walnut Ridge", state: "AR" },

  // CALIFORNIA
  "Cal Maritime": { city: "Vallejo", state: "CA" },
  "Hope International": { city: "Fullerton", state: "CA" },
  "La Sierra": { city: "Riverside", state: "CA" },
  "Life Pacific": { city: "San Dimas", state: "CA" },
  "Pacific Union (CA)": { city: "Angwin", state: "CA" },
  "Saint Katherine (CA)": { city: "San Marcos", state: "CA" },
  "Simpson (CA)": { city: "Redding", state: "CA" },
  "Stanton (CA)": { city: "Stanton", state: "CA" },
  "The Master's (Calif.)": { city: "Santa Clarita", state: "CA" },
  "Westcliff (Calif.)": { city: "Irvine", state: "CA" },
  "Antelope Valley": { city: "Lancaster", state: "CA" },

  // FLORIDA
  "Ave Maria": { city: "Ave Maria", state: "FL" },
  "Coastal Georgia": { city: "Brunswick", state: "GA" }, // Actually in GA
  "Florida College (FL)": { city: "Temple Terrace", state: "FL" },
  "Florida Memorial": { city: "Miami Gardens", state: "FL" },
  "Florida National": { city: "Hialeah", state: "FL" },
  "Keiser (Fla.)": { city: "West Palm Beach", state: "FL" },
  "New College of Florida": { city: "Sarasota", state: "FL" },
  "Southeastern (Fla.)": { city: "Lakeland", state: "FL" },
  "St. Thomas (Fla.)": { city: "Miami Gardens", state: "FL" },
  "Warner (FL)": { city: "Lake Wales", state: "FL" },
  "Webber International (FL)": { city: "Babson Park", state: "FL" },

  // GEORGIA
  "Abraham Baldwin Agricultural": { city: "Tifton", state: "GA" },
  "Brewton-Parker (GA)": { city: "Mount Vernon", state: "GA" },
  "Dalton State (GA)": { city: "Dalton", state: "GA" },
  "Georgia Gwinnett": { city: "Lawrenceville", state: "GA" },
  "Life": { city: "Marietta", state: "GA" },
  "Point": { city: "West Point", state: "GA" },
  "Reinhardt (Ga.)": { city: "Waleska", state: "GA" },
  "Thomas": { city: "Thomasville", state: "GA" },
  "Truett McConnell": { city: "Cleveland", state: "GA" },

  // IDAHO
  "College of Idaho": { city: "Caldwell", state: "ID" },
  "Lewis-Clark State (Idaho)": { city: "Lewiston", state: "ID" },

  // ILLINOIS
  "Judson (IL)": { city: "Elgin", state: "IL" },
  "Olivet Nazarene (IL)": { city: "Bourbonnais", state: "IL" },
  "Saint Xavier (IL)": { city: "Chicago", state: "IL" },
  "St. Francis (IL)": { city: "Joliet", state: "IL" },
  "Trinity Christian (IL)": { city: "Palos Heights", state: "IL" },

  // INDIANA
  "Bethel (IN)": { city: "Mishawaka", state: "IN" },
  "Calumet (IN)": { city: "Whiting", state: "IN" },
  "Goshen (IN)": { city: "Goshen", state: "IN" },
  "Grace (Ind.)": { city: "Winona Lake", state: "IN" },
  "Holy Cross (Ind.)": { city: "Notre Dame", state: "IN" },
  "Huntington (IN)": { city: "Huntington", state: "IN" },
  "Indiana East": { city: "Richmond", state: "IN" },
  "Indiana Northwest": { city: "Gary", state: "IN" },
  "Indiana South Bend (IN)": { city: "South Bend", state: "IN" },
  "Indiana Southeast": { city: "New Albany", state: "IN" },
  "Indiana Tech": { city: "Fort Wayne", state: "IN" },
  "Indiana Wesleyan": { city: "Marion", state: "IN" },
  "IU Columbus": { city: "Columbus", state: "IN" },
  "IU Kokomo": { city: "Kokomo", state: "IN" },
  "Marian": { city: "Indianapolis", state: "IN" },
  "Oakland City (IN)": { city: "Oakland City", state: "IN" },
  "Saint Francis (IN)": { city: "Fort Wayne", state: "IN" },
  "Taylor (IN)": { city: "Upland", state: "IN" },

  // IOWA
  "Briar Cliff (IA)": { city: "Sioux City", state: "IA" },
  "Clarke (IA)": { city: "Dubuque", state: "IA" },
  "Dordt (IA)": { city: "Sioux Center", state: "IA" },
  "Graceland": { city: "Lamoni", state: "IA" },
  "Grand View": { city: "Des Moines", state: "IA" },
  "Morningside (Iowa)": { city: "Sioux City", state: "IA" },
  "Mount Mercy": { city: "Cedar Rapids", state: "IA" },
  "Northwestern (Iowa)": { city: "Orange City", state: "IA" },
  "St. Ambrose (IA)": { city: "Davenport", state: "IA" },
  "Waldorf": { city: "Forest City", state: "IA" },
  "William Penn (Iowa)": { city: "Oskaloosa", state: "IA" },

  // KANSAS
  "Baker": { city: "Baldwin City", state: "KS" },
  "Benedictine (KS)": { city: "Atchison", state: "KS" },
  "Bethany (KS)": { city: "Lindsborg", state: "KS" },
  "Bethel (KS)": { city: "North Newton", state: "KS" },
  "Central Christian (KS)": { city: "McPherson", state: "KS" },
  "Friends (KS)": { city: "Wichita", state: "KS" },
  "Kansas Wesleyan": { city: "Salina", state: "KS" },
  "McPherson (Kan.)": { city: "McPherson", state: "KS" },
  "Ottawa (Kan.)": { city: "Ottawa", state: "KS" },
  "Saint Mary": { city: "Leavenworth", state: "KS" },
  "Southwestern": { city: "Winfield", state: "KS" },
  "Sterling": { city: "Sterling", state: "KS" },
  "Tabor": { city: "Hillsboro", state: "KS" },

  // KENTUCKY
  "Alice Lloyd (KY)": { city: "Pippa Passes", state: "KY" },
  "Brescia (KY)": { city: "Owensboro", state: "KY" },
  "Campbellsville (KY)": { city: "Campbellsville", state: "KY" },
  "Cumberlands (Ky.)": { city: "Williamsburg", state: "KY" },
  "Georgetown (Ky.)": { city: "Georgetown", state: "KY" },
  "Kentucky Christian": { city: "Grayson", state: "KY" },
  "Lindsey Wilson (Ky.)": { city: "Columbia", state: "KY" },
  "Midway": { city: "Midway", state: "KY" },
  "Pikeville (KY)": { city: "Pikeville", state: "KY" },

  // LOUISIANA
  "Dillard (La.)": { city: "New Orleans", state: "LA" },
  "Louisiana Christian": { city: "Pineville", state: "LA" },
  "Loyola (La.)": { city: "New Orleans", state: "LA" },
  "LSU Alexandria (La.)": { city: "Alexandria", state: "LA" },
  "LSU Shreveport (La.)": { city: "Shreveport", state: "LA" },
  "Southern University at New Orleans (LA)": { city: "New Orleans", state: "LA" },
  "Xavier (La.)": { city: "New Orleans", state: "LA" },

  // MARYLAND
  "Washington Adventist (MD)": { city: "Takoma Park", state: "MD" },

  // MASSACHUSETTS
  "Fisher (MA)": { city: "Boston", state: "MA" },

  // MICHIGAN
  "Aquinas (Mich.)": { city: "Grand Rapids", state: "MI" },
  "Cleary (MI)": { city: "Howell", state: "MI" },
  "Cornerstone": { city: "Grand Rapids", state: "MI" },
  "Lawrence Tech": { city: "Southfield", state: "MI" },
  "Lourdes": { city: "Sylvania", state: "OH" }, // Actually in OH
  "Madonna (Mich.)": { city: "Livonia", state: "MI" },
  "Michigan-Dearborn": { city: "Dearborn", state: "MI" },
  "Rochester Christian (Mich.)": { city: "Rochester Hills", state: "MI" },
  "Siena Heights": { city: "Adrian", state: "MI" },
  "Spring Arbor (Mich.)": { city: "Spring Arbor", state: "MI" },

  // MISSISSIPPI
  "Blue Mountain Christian (MS)": { city: "Blue Mountain", state: "MS" },
  "Rust (MS)": { city: "Holly Springs", state: "MS" },
  "Tougaloo (Miss.)": { city: "Tougaloo", state: "MS" },
  "William Carey (Miss.)": { city: "Hattiesburg", state: "MS" },

  // MISSOURI
  "Avila (MO)": { city: "Kansas City", state: "MO" },
  "Central Methodist": { city: "Fayette", state: "MO" },
  "College of the Ozarks": { city: "Point Lookout", state: "MO" },
  "Columbia (MO)": { city: "Columbia", state: "MO" },
  "Culver-Stockton (MO)": { city: "Canton", state: "MO" },
  "Evangel (Mo.)": { city: "Springfield", state: "MO" },
  "Hannibal-LaGrange (MO)": { city: "Hannibal", state: "MO" },
  "Harris-Stowe (MO)": { city: "St. Louis", state: "MO" },
  "MidAmerica Nazarene": { city: "Olathe", state: "KS" }, // Actually in KS
  "Mission (Mo.)": { city: "Kansas City", state: "MO" },
  "Missouri Baptist": { city: "St. Louis", state: "MO" },
  "Missouri Valley": { city: "Marshall", state: "MO" },
  "Park": { city: "Parkville", state: "MO" },
  "William Woods": { city: "Fulton", state: "MO" },

  // MONTANA
  "Carroll (MT)": { city: "Helena", state: "MT" },
  "Montana State-Northern (MT)": { city: "Havre", state: "MT" },
  "Montana Tech (MT)": { city: "Butte", state: "MT" },
  "Montana Western (MT)": { city: "Dillon", state: "MT" },
  "Providence (MT)": { city: "Great Falls", state: "MT" },
  "Rocky Mountain (MT)": { city: "Billings", state: "MT" },

  // NEBRASKA
  "Bellevue (NE)": { city: "Bellevue", state: "NE" },
  "Concordia (Neb.)": { city: "Seward", state: "NE" },
  "Doane (NE)": { city: "Crete", state: "NE" },
  "Hastings": { city: "Hastings", state: "NE" },
  "Midland": { city: "Fremont", state: "NE" },
  "Peru State": { city: "Peru", state: "NE" },
  "York (NE)": { city: "York", state: "NE" },

  // NEW MEXICO
  "Northern New Mexico": { city: "Espanola", state: "NM" },

  // NORTH CAROLINA
  "Carolina (N.C.)": { city: "Winston-Salem", state: "NC" },
  "Montreat (NC)": { city: "Montreat", state: "NC" },

  // NORTH DAKOTA
  "Bismarck State (ND)": { city: "Bismarck", state: "ND" },
  "Dickinson State (ND)": { city: "Dickinson", state: "ND" },
  "Mayville State": { city: "Mayville", state: "ND" },
  "Valley City State": { city: "Valley City", state: "ND" },

  // OHIO
  "Defiance College (OH)": { city: "Defiance", state: "OH" },
  "Mount Vernon Nazarene (OH)": { city: "Mount Vernon", state: "OH" },
  "Northwestern Ohio": { city: "Lima", state: "OH" },
  "Rio Grande": { city: "Rio Grande", state: "OH" },
  "Shawnee State": { city: "Portsmouth", state: "OH" },
  "Wilberforce (OH)": { city: "Wilberforce", state: "OH" },
  "Lourdes": { city: "Sylvania", state: "OH" },

  // OKLAHOMA
  "Langston (Okla.)": { city: "Langston", state: "OK" },
  "Mid-America Christian": { city: "Oklahoma City", state: "OK" },
  "Oklahoma City": { city: "Oklahoma City", state: "OK" },
  "Oklahoma Panhandle State": { city: "Goodwell", state: "OK" },
  "Oklahoma Wesleyan": { city: "Bartlesville", state: "OK" },
  "Science and Arts": { city: "Chickasha", state: "OK" },
  "Southwestern Christian": { city: "Bethany", state: "OK" },
  "UNT Dallas": { city: "Dallas", state: "TX" }, // Actually in TX

  // OREGON
  "Bushnell (OR)": { city: "Eugene", state: "OR" },
  "Corban": { city: "Salem", state: "OR" },
  "Eastern Oregon": { city: "La Grande", state: "OR" },
  "Oregon Tech": { city: "Klamath Falls", state: "OR" },
  "Southern Oregon": { city: "Ashland", state: "OR" },
  "Warner Pacific (OR)": { city: "Portland", state: "OR" },

  // PENNSYLVANIA
  "Point Park": { city: "Pittsburgh", state: "PA" },

  // SOUTH CAROLINA
  "CIU (SC)": { city: "Columbia", state: "SC" },
  "Columbia (SC)": { city: "Columbia", state: "SC" },
  "Spartanburg Methodist": { city: "Spartanburg", state: "SC" },
  "Voorhees University": { city: "Denmark", state: "SC" },

  // SOUTH DAKOTA
  "Dakota State (SD)": { city: "Madison", state: "SD" },
  "Dakota Wesleyan (SD)": { city: "Mitchell", state: "SD" },
  "Mount Marty": { city: "Yankton", state: "SD" },

  // TENNESSEE
  "Bethel (TN)": { city: "McKenzie", state: "TN" },
  "Bryan (TN)": { city: "Dayton", state: "TN" },
  "Cumberland (Tenn.)": { city: "Lebanon", state: "TN" },
  "Fisk (TN)": { city: "Nashville", state: "TN" },
  "Freed-Hardeman (Tenn.)": { city: "Henderson", state: "TN" },
  "Johnson (TN)": { city: "Knoxville", state: "TN" },
  "Milligan (TN)": { city: "Milligan", state: "TN" },
  "Tennessee Southern": { city: "Pulaski", state: "TN" },
  "Tennessee Wesleyan": { city: "Athens", state: "TN" },
  "Union Commonwealth": { city: "Barbourville", state: "KY" }, // Actually in KY

  // TEXAS
  "Huston-Tillotson": { city: "Austin", state: "TX" },
  "Jarvis Christian": { city: "Hawkins", state: "TX" },
  "John Brown": { city: "Siloam Springs", state: "AR" }, // Actually in AR
  "Nelson (Texas)": { city: "Lake Dallas", state: "TX" },
  "North American": { city: "Houston", state: "TX" },
  "Our Lady of the Lake": { city: "San Antonio", state: "TX" },
  "Southwest": { city: "El Paso", state: "TX" },
  "Texas A&M  Texarkana": { city: "Texarkana", state: "TX" },
  "Texas A&amp;M-San Antonio": { city: "San Antonio", state: "TX" },
  "Texas College": { city: "Tyler", state: "TX" },
  "Texas Wesleyan": { city: "Fort Worth", state: "TX" },
  "Wayland Baptist (TX)": { city: "Plainview", state: "TX" },
  "Wiley (TX)": { city: "Marshall", state: "TX" },

  // VIRGIN ISLANDS
  "Virgin Islands": { city: "Charlotte Amalie", state: "VI" },

  // VIRGINIA
  "Bluefield (VA)": { city: "Bluefield", state: "VA" },

  // WASHINGTON
  "Evergreen (WA)": { city: "Olympia", state: "WA" },
  "Northwest (WA)": { city: "Kirkland", state: "WA" },
  "Walla Walla": { city: "College Place", state: "WA" },

  // WEST VIRGINIA
  "WVU Tech (WV)": { city: "Beckley", state: "WV" },

  // WISCONSIN
  "Viterbo": { city: "La Crosse", state: "WI" },

  // Additional variations/aliases that might be in the database
  "John Brown": { city: "Siloam Springs", state: "AR" },
  "Morris": { city: "Sumter", state: "SC" },
  "Haskell Indian Nations University": { city: "Lawrence", state: "KS" },

  // Name variations found in database
  "Abraham Baldwin (Ga.)": { city: "Tifton", state: "GA" },
  "Brenau (GA)": { city: "Gainesville", state: "GA" },
  "Cleary (Mich.)": { city: "Howell", state: "MI" },
  "College of Saint Mary (NE)": { city: "Omaha", state: "NE" },
  "Cottey (MO)": { city: "Nevada", state: "MO" },
  "Georgia Gwinnett College": { city: "Lawrenceville", state: "GA" },
  "Governors State": { city: "University Park", state: "IL" },
  "Hesston College": { city: "Hesston", state: "KS" },
  "Mount Mary": { city: "Milwaukee", state: "WI" },
  "Northwest": { city: "Kirkland", state: "WA" },
  "Paul Quinn": { city: "Dallas", state: "TX" },
  "Saint Francis (Ind.)": { city: "Fort Wayne", state: "IN" },
  "Stephens": { city: "Columbia", state: "MO" },
  "St. Mary-Woods": { city: "Saint Mary of the Woods", state: "IN" },
  "UHSP": { city: "St. Louis", state: "MO" },
};

module.exports = { teamLocations };

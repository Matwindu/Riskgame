// World map territories with adjacencies
const TERRITORIES = {
  // NORTH AMERICA
  'alaska': { name: 'Alaska', continent: 'north_america', x: 8, y: 12 },
  'northwest_territory': { name: 'NW Territory', continent: 'north_america', x: 16, y: 10 },
  'greenland': { name: 'Greenland', continent: 'north_america', x: 28, y: 5 },
  'alberta': { name: 'Alberta', continent: 'north_america', x: 14, y: 15 },
  'ontario': { name: 'Ontario', continent: 'north_america', x: 20, y: 15 },
  'quebec': { name: 'Québec', continent: 'north_america', x: 26, y: 14 },
  'western_us': { name: 'Western US', continent: 'north_america', x: 14, y: 20 },
  'eastern_us': { name: 'Eastern US', continent: 'north_america', x: 21, y: 20 },
  'central_america': { name: 'Central America', continent: 'north_america', x: 17, y: 26 },

  // SOUTH AMERICA
  'venezuela': { name: 'Venezuela', continent: 'south_america', x: 24, y: 29 },
  'peru': { name: 'Peru', continent: 'south_america', x: 23, y: 35 },
  'brazil': { name: 'Brazil', continent: 'south_america', x: 29, y: 34 },
  'argentina': { name: 'Argentine', continent: 'south_america', x: 25, y: 42 },

  // EUROPE
  'iceland': { name: 'Islande', continent: 'europe', x: 37, y: 8 },
  'great_britain': { name: 'G. Bretagne', continent: 'europe', x: 39, y: 13 },
  'western_europe': { name: 'Europe Ouest', continent: 'europe', x: 40, y: 18 },
  'northern_europe': { name: 'Europe Nord', continent: 'europe', x: 44, y: 13 },
  'southern_europe': { name: 'Europe Sud', continent: 'europe', x: 44, y: 18 },
  'ukraine': { name: 'Ukraine', continent: 'europe', x: 50, y: 13 },

  // AFRICA
  'north_africa': { name: 'Afrique Nord', continent: 'africa', x: 42, y: 24 },
  'egypt': { name: 'Égypte', continent: 'africa', x: 49, y: 24 },
  'east_africa': { name: 'Afrique Est', continent: 'africa', x: 51, y: 30 },
  'central_africa': { name: 'Afrique Centre', continent: 'africa', x: 46, y: 31 },
  'west_africa': { name: 'Afrique Ouest', continent: 'africa', x: 41, y: 30 },
  'south_africa': { name: 'Afrique Sud', continent: 'africa', x: 48, y: 37 },

  // ASIA
  'ural': { name: 'Oural', continent: 'asia', x: 56, y: 10 },
  'siberia': { name: 'Sibérie', continent: 'asia', x: 63, y: 8 },
  'yakutsk': { name: 'Yakoutsk', continent: 'asia', x: 70, y: 7 },
  'kamchatka': { name: 'Kamtchatka', continent: 'asia', x: 78, y: 9 },
  'irkutsk': { name: 'Irkoutsk', continent: 'asia', x: 68, y: 13 },
  'mongolia': { name: 'Mongolie', continent: 'asia', x: 67, y: 18 },
  'japan': { name: 'Japon', continent: 'asia', x: 77, y: 18 },
  'afghanistan': { name: 'Afghanistan', continent: 'asia', x: 57, y: 18 },
  'china': { name: 'Chine', continent: 'asia', x: 67, y: 22 },
  'middle_east': { name: 'Moyen-Orient', continent: 'asia', x: 54, y: 23 },
  'india': { name: 'Inde', continent: 'asia', x: 61, y: 26 },
  'siam': { name: 'Asie du Sud', continent: 'asia', x: 68, y: 28 },

  // OCEANIA
  'indonesia': { name: 'Indonésie', continent: 'oceania', x: 70, y: 34 },
  'new_guinea': { name: 'Nouvelle-Guinée', continent: 'oceania', x: 77, y: 34 },
  'western_australia': { name: 'Australie Ouest', continent: 'oceania', x: 73, y: 41 },
  'eastern_australia': { name: 'Australie Est', continent: 'oceania', x: 79, y: 41 },
};

const ADJACENCIES = {
  'alaska': ['northwest_territory', 'alberta', 'kamchatka'],
  'northwest_territory': ['alaska', 'alberta', 'ontario', 'greenland'],
  'greenland': ['northwest_territory', 'ontario', 'quebec', 'iceland'],
  'alberta': ['alaska', 'northwest_territory', 'ontario', 'western_us'],
  'ontario': ['northwest_territory', 'alberta', 'greenland', 'quebec', 'western_us', 'eastern_us'],
  'quebec': ['ontario', 'greenland', 'eastern_us'],
  'western_us': ['alberta', 'ontario', 'eastern_us', 'central_america'],
  'eastern_us': ['ontario', 'quebec', 'western_us', 'central_america'],
  'central_america': ['western_us', 'eastern_us', 'venezuela'],

  'venezuela': ['central_america', 'peru', 'brazil'],
  'peru': ['venezuela', 'brazil', 'argentina'],
  'brazil': ['venezuela', 'peru', 'argentina', 'north_africa'],
  'argentina': ['peru', 'brazil'],

  'iceland': ['greenland', 'great_britain', 'northern_europe'],
  'great_britain': ['iceland', 'western_europe', 'northern_europe'],
  'western_europe': ['great_britain', 'northern_europe', 'southern_europe', 'north_africa'],
  'northern_europe': ['great_britain', 'iceland', 'western_europe', 'southern_europe', 'ukraine'],
  'southern_europe': ['western_europe', 'northern_europe', 'ukraine', 'north_africa', 'egypt', 'middle_east'],
  'ukraine': ['northern_europe', 'southern_europe', 'ural', 'afghanistan', 'middle_east'],

  'north_africa': ['western_europe', 'southern_europe', 'brazil', 'egypt', 'east_africa', 'central_africa', 'west_africa'],
  'egypt': ['north_africa', 'southern_europe', 'middle_east', 'east_africa'],
  'east_africa': ['egypt', 'north_africa', 'central_africa', 'south_africa', 'middle_east'],
  'central_africa': ['north_africa', 'east_africa', 'west_africa', 'south_africa'],
  'west_africa': ['north_africa', 'central_africa'],
  'south_africa': ['east_africa', 'central_africa'],

  'ural': ['ukraine', 'siberia', 'afghanistan', 'china'],
  'siberia': ['ural', 'yakutsk', 'irkutsk', 'mongolia', 'china'],
  'yakutsk': ['siberia', 'kamchatka', 'irkutsk'],
  'kamchatka': ['alaska', 'yakutsk', 'irkutsk', 'mongolia', 'japan'],
  'irkutsk': ['siberia', 'yakutsk', 'kamchatka', 'mongolia'],
  'mongolia': ['siberia', 'irkutsk', 'kamchatka', 'china', 'japan'],
  'japan': ['kamchatka', 'mongolia'],
  'afghanistan': ['ukraine', 'ural', 'china', 'india', 'middle_east'],
  'china': ['ural', 'siberia', 'mongolia', 'afghanistan', 'india', 'siam'],
  'middle_east': ['ukraine', 'southern_europe', 'egypt', 'east_africa', 'afghanistan', 'india'],
  'india': ['middle_east', 'afghanistan', 'china', 'siam'],
  'siam': ['india', 'china', 'indonesia'],

  'indonesia': ['siam', 'new_guinea', 'western_australia'],
  'new_guinea': ['indonesia', 'western_australia', 'eastern_australia'],
  'western_australia': ['indonesia', 'new_guinea', 'eastern_australia'],
  'eastern_australia': ['new_guinea', 'western_australia'],
};

const CONTINENTS = {
  'north_america': { name: 'Amérique du Nord', bonus: 1, color: '#e8a87c' },
  'south_america': { name: 'Amérique du Sud', bonus: 1, color: '#f6d55c' },
  'europe': { name: 'Europe', bonus: 1, color: '#84b8e0' },
  'africa': { name: 'Afrique', bonus: 1, color: '#8bc34a' },
  'asia': { name: 'Asie', bonus: 1, color: '#ce93d8' },
  'oceania': { name: 'Océanie', bonus: 1, color: '#80cbc4' },
};

module.exports = { TERRITORIES, ADJACENCIES, CONTINENTS };

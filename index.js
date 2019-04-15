const Table = require("cli-table");
require("dotenv").config();

function calculateBracket() {
  const seedById = Array.from(document.querySelectorAll(".seed")).reduce(
    (byId, node) => {
      byId[node.parentNode.getAttribute("data-id")] = parseInt(
        node.innerText,
        10
      );
      return byId;
    },
    {}
  );
  const teamsById = Array.from(
    document.querySelectorAll("[data-id]>.teamName")
  ).reduce((byId, node) => {
    byId[node.parentNode.getAttribute("data-id")] = node.innerText;
    return byId;
  }, {});

  const round1Correct = document.querySelectorAll(".matchupRound2 .correctPick")
    .length;
  const round2Correct = document.querySelectorAll(".matchupRound3 .correctPick")
    .length;
  const round3Correct /* Sweet 16 */ = document.querySelectorAll(
    ".matchupRound4 .correctPick"
  ).length;
  const round4Correct /* Elite Eight */ = document.querySelectorAll(
    ".matchupRound5 .correctPick"
  ).length;
  const round5Correct /* Final Four */ = document.querySelectorAll(
    ".matchupRound6 .correctPick:not(.championshipPickedTeam)"
  ).length;
  const round6Correct /* Finals */ = document.querySelectorAll(
    ".matchupRound6 .correctPick.championshipPickedTeam"
  ).length;

  const totalPoints =
    round1Correct * 1 +
    round2Correct * 2 +
    round3Correct * 3 +
    round4Correct * 4 +
    round5Correct * 5 +
    round6Correct * 0;

  const upsets = [];
  function upsetsInRound(round) {
    return Array.from(
      document.querySelectorAll(`.matchupRound${round + 1} .correctPick`)
    )
      .filter(pickNode => pickNode.getAttribute("id") !== "winningTeamPick")
      .filter(pickNode => {
        const teamId = pickNode.parentNode.getAttribute("data-id");
        const teamSeed = seedById[teamId];
        const opponent = Array.from(
          document.querySelector(`.matchupRound${round} [data-id="${teamId}"]`)
            .parentNode.children
        ).find(
          node =>
            node.getAttribute("data-id") !== teamId &&
            node.classList.contains("teamContainer")
        );
        const opponentId = opponent.getAttribute("data-id");
        const opponentSeed = seedById[opponentId];
        if (teamSeed > opponentSeed) {
          upsets.push({ round, teamId, teamSeed, opponentId, opponentSeed });
          // } else {
          // 	console.log('Snoozer', { teamId, teamSeed, opponentId, opponentSeed });
        }
        return teamSeed > opponentSeed;
      });
  }
  const upsetsPicked = [1, 2, 3, 4, 5].reduce(
    (sum, round) => sum + upsetsInRound(round).length,
    0
  );

  const totalDollars = totalPoints * 10 + upsetsPicked * 25;
  console.log("totalDollars: ", totalDollars);
  return { totalPoints, upsetsPicked, upsets, totalDollars };
}

const getBracket = browser => async ({ name, url }) => {
  const page = await browser.newPage();
  await page.goto(url);
  await page.content();
  try {
    console.log(`Starting to parse ${name}'s bracket.`);
    const results = await page.evaluate(calculateBracket);
    console.log(`Finished parsing ${name}'s bracket.`);
    return { results, name };
  } catch (error) {
    console.log(`Error parsing results for ${name}`);
    return { name, error };
  }
};

function printUpsetReport(results) {
  const upsetTable = new Table({
    head: ["Rank", "Team 1", "Rank", "Team 2", "🔮"]
  });
  const makeUpsetKey = upset =>
    [upset.round, upset.teamId, upset.opponentId].join("-");
  const withUpsetKey = f => (acc, upset) => f(acc, upset, makeUpsetKey(upset));
  const logReduction = f => (...args) => {
    console.log("Before:", args[0]);
    const result = f(...args);
    console.log("After:", result);
    return result;
  };
  const {
    upsetsById,
    upsetIds,
    pickersByUpsetId,
    upsetIdsByPicker,
    pickers
  } = results
    .map(result =>
      result.results.upsets.map(upset => ({ ...upset, name: result.name }))
    )
    .reduce((acc, xs) => acc.concat(xs), [])
    .reduce(
      withUpsetKey(
        (
          { upsetsById, upsetIds, pickersByUpsetId, upsetIdsByPicker, pickers },
          upset,
          key
        ) => ({
          upsetsById: {
            ...upsetsById,
            [key]: upset
          },
          upsetIds:
            upsetIds.indexOf(key) >= 0 ? upsetIds : upsetIds.concat(key),
          pickersByUpsetId: {
            ...pickersByUpsetId,
            [key]: pickersByUpsetId[key]
              ? pickersByUpsetId[key].concat(upset.name)
              : [upset.name]
          },
          upsetIdsByPicker: {
            ...upsetIdsByPicker,
            [upset.name]: upsetIdsByPicker[upset.name]
              ? upsetIdsByPicker[upset.name].concat(key)
              : [key]
          },
          pickers:
            pickers.indexOf(upset.name) >= 0
              ? pickers
              : pickers.concat(upset.name)
        })
      ),
      {
        upsetsById: {},
        upsetIds: [],
        pickersByUpsetId: {},
        upsetIdsByPicker: {},
        pickers: []
      }
    );
  upsetIds.forEach(id => {
    const { teamSeed, teamId, opponentSeed, opponentId } = upsetsById[id];
    const pickers = pickersByUpsetId[id];
    upsetTable.push([
      teamSeed,
      teamId,
      opponentSeed,
      opponentId,
      pickers.join("\n")
    ]);
  });
  console.log(upsetTable.toString());
  pickers
    .sort((a, b) => a.toLowerCase() < b.toLowerCase())
    .forEach(name => {
      const upsetIds = upsetIdsByPicker[name];
      const upsets = upsetIds.map(id => ({ id, ...upsetsById[id] }));
      console.log(`Upset Report for ${name}`);
      const table = new Table({
        head: ["Round", "Upset", "How many other people picked this?"]
      });
      upsets.forEach(upset => {
        const numPicked = pickersByUpsetId[upset.id].reduce(x => x + 1, -1);
        table.push([
          upset.round,
          `${upset.teamSeed} ${upset.teamId} over ${upset.opponentSeed} ${
            upset.opponentId
          }`,
          numPicked === 0 ? "0! 😱🔮" : numPicked
        ]);
      });
      console.log(table.toString());
    });
}

function printScoreSummary(results) {
  const table = new Table({
    head: ["", "🙀 # Upsets Picked", "🦂 Score", "💰"]
  });
  results.forEach(result => {
    table.push([
      result.name,
      result.results.upsetsPicked,
      result.results.totalPoints,
      `$${result.results.totalDollars}`
    ]);
  });
  console.log(table.toString());
}

const leaguePage = "http://scottfamilyshowdown.mayhem.cbssports.com/";
async function scrapeResults({ username, password }) {
  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS !== "false"
  });
  const page = await browser.newPage();

  // log in
  console.log("Logging in to cbssports.com");
  await page.goto(leaguePage);
  await page.type("#userid", username);
  await page.type("#password", password);
  await page.click('.formButton[type="submit"]');
  await page.waitForSelector(".featureData");
  await page.goto(
    "http://scottfamilyshowdown.mayhem.cbssports.com/brackets/standings"
  );

  // gather bracket urls
  const brackets = await page.evaluate(() =>
    [...document.querySelectorAll("a")]
      .filter(a =>
        a
          .getAttribute("href")
          .match(/http:\/\/scottfamilyshowdown.mayhem.cbssports.com\/brackets/)
      )
      .map(a => ({
        url: a.getAttribute("href"),
        name: a.textContent
      }))
  );
  console.log(
    `Found ${brackets.length} ${
      brackets.length === 1 ? "bracket" : "brackets"
    }.`
  );

  console.log("Processing brackets...");
  const results = await Promise.all(brackets.map(getBracket(browser)));
  console.log("Processed all brackets! 🎉");

  await browser.close();

  return results;
}

const getConfig = () => ({
  password: process.env.CBSSPORTS_PASSWORD,
  username: process.env.CBSSPORTS_USERNAME,
  useFileCache: process.env.READ_RESULTS === "true",
  writeResults: process.env.WRITE_RESULTS === "true"
});

(async function main() {
  const { username, password, useFileCache, writeResults } = getConfig();
  const results = useFileCache
    ? JSON.parse(require("fs").readFileSync("results.json", "UTF-8"))
    : await scrapeResults({ username, password });

  if (writeResults) {
    require("fs").writeFileSync("results.json", JSON.stringify(results));
  }

  printScoreSummary(results);
  printUpsetReport(results);
})();

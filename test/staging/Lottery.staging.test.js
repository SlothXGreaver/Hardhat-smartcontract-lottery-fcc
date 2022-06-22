const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-config");

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery Staging Tests", function () {
          let lottery, lotteryEntranceFee, deployer;

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer;
              lottery = await ethers.getContract("Lottery", deployer);
              lotteryEntranceFee = await lottery.getEntranceFee();
          });

          describe("fulfillRandomWords", function () {
              it("TEST: We have a Random Winner when using Chainlink Keepers and VRF...", async function () {
                  console.log("Marker: Setting up test...");
                  const startingTimeStamp = await lottery.getLatestTimeStamp();
                  const accounts = await ethers.getSigners();

                  console.log("Marker: Setting up Listener...");
                  await new Promise(async (resolve, reject) => {
                      lottery.once("WinnerPicked", async () => {
                          console.log("Marker: WinnerPicked event...");
                          try {
                              const recentWinner =
                                  await lottery.getRecentWinner();
                              const lotteryState =
                                  await lottery.getLotteryState();
                              const winnerEndingBalance =
                                  await accounts[0].getBalance();
                              const endingTimeStamp =
                                  await lottery.getLatestTimeStamp();

                              await expect(lottery.getPlayer(0)).to.be.reverted;
                              console.log("Marker: getPlayer reverted...");
                              assert.equal(
                                  recentWinner.toString(),
                                  accounts[0].address
                              );
                              console.log(
                                  "Marker: winner address is correct..."
                              );
                              assert.equal(lotteryState, 0);
                              console.log(
                                  "Marker: lotteryState is reinitialised..."
                              );
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance
                                      .add(lotteryEntranceFee)
                                      .toString()
                              );
                              console.log("Marker: winnings are deposited...");
                              assert(endingTimeStamp > startingTimeStamp);
                              console.log(
                                  "Marker: timestamp has progressed..."
                              );
                              resolve();
                          } catch (error) {
                              console.log(error);
                              reject(error);
                          }
                      });
                      console.log("Marker: Entering Lottery...");
                      const tx = await lottery.enterLottery({
                          value: lotteryEntranceFee,
                      });
                      await tx.wait(1);
                      console.log("Marker: Waiting Time...");
                      const winnerStartingBalance =
                          await accounts[0].getBalance();
                  });
              });
          });
      });

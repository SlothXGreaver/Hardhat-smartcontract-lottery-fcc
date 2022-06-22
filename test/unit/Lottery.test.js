const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-config");

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery Unit Tests", function () {
          let lottery,
              VRFCoordinatorV2Mock,
              lotteryEntranceFee,
              deployer,
              interval;
          const chainId = network.config.chainId;

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer;
              await deployments.fixture(["all"]);
              lottery = await ethers.getContract("Lottery", deployer);
              VRFCoordinatorV2Mock = await ethers.getContract(
                  "VRFCoordinatorV2Mock",
                  deployer
              );
              lotteryEntranceFee = await lottery.getEntranceFee();
              interval = await lottery.getInterval();
          });

          describe("constructor", function () {
              it("TEST: Lottery gets Initialised Correctly...", async function () {
                  const lotteryState = await lottery.getLotteryState();
                  assert.equal(lotteryState.toString(), "0");
                  assert.equal(
                      interval.toString(),
                      networkConfig[chainId]["interval"]
                  );
              });
          });

          describe("enterLottery", function () {
              it("TEST: Lottery reverts when the entry amount is not right...", async function () {
                  await expect(lottery.enterLottery()).to.be.revertedWith(
                      "Lottery__WrongAmountofEthEntered"
                  );
              });

              it("TEST: Makes a record of players when they enter...", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee });
                  const playerFromContract = await lottery.getPlayer(0);
                  assert.equal(playerFromContract, deployer);
              });

              it("TEST: 'Lottery Entered' event is emitted correctly...", async function () {
                  await expect(
                      lottery.enterLottery({ value: lotteryEntranceFee })
                  ).to.emit(lottery, "LotteryEnter");
              });

              it("TEST: Lottery is closed-off when calculating...", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.send("evm_mine", []);
                  await lottery.performUpkeep([]);
                  await expect(
                      lottery.enterLottery({ value: lotteryEntranceFee })
                  ).to.be.revertedWith("Lottery__NotOpen");
              });
          });

          describe("checkUpkeep", function () {
              it("TEST: CheckUpkeep returns false upon non-payment...", async function () {
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.send("evm_mine", []);
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep(
                      []
                  );
                  assert(!upkeepNeeded);
              });

              it("TEST: CheckUpkeep returns false if lottery is closed...", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.send("evm_mine", []);
                  await lottery.performUpkeep([]);
                  const lotteryState = await lottery.getLotteryState();
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep(
                      []
                  );
                  assert.equal(lotteryState.toString(), "1");
                  assert.equal(upkeepNeeded, false);
              });

              it("TEST: Returns false if enough time hasn't passed...", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() - 1,
                  ]);
                  await network.provider.send("evm_mine", []);
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep(
                      []
                  );
                  assert(!upkeepNeeded);
              });

              it("TEST: Returns true if enough time has passed, has players, ETH and is open...", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.send("evm_mine", []);
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep(
                      []
                  );
                  assert(upkeepNeeded);
              });
          });

          describe("performUpkeep", function () {
              it("TEST: PerformUpkeep can only run when checkUpkeep is true...", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.send("evm_mine", []);
                  const tx = await lottery.performUpkeep([]);
                  assert(tx);
              });

              it("TEST: PerformUpkeep reverts when checkUpkeep is false...", async function () {
                  await expect(lottery.performUpkeep([])).to.be.revertedWith(
                      "Lottery__UpkeepNotNeeded"
                  );
              });

              it("TEST: Lottery state updates, emits an event and calls the VRFCoordinator...", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.send("evm_mine", []);
                  const txResponse = await lottery.performUpkeep([]);
                  const txReceipt = await txResponse.wait(1);
                  const requestId = txReceipt.events[1].args.requestId;
                  const lotteryState = await lottery.getLotteryState();
                  assert(requestId.toNumber() > 0);
                  assert(lotteryState.toString() == 1);
              });
          });

          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.send("evm_mine", []);
              });

              it("TEST: FulfillRandomWords can only run after PerformUpkeep has run...", async function () {
                  await expect(
                      VRFCoordinatorV2Mock.fulfillRandomWords(
                          0,
                          lottery.address
                      )
                  ).to.be.revertedWith("nonexistent request");
                  await expect(
                      VRFCoordinatorV2Mock.fulfillRandomWords(
                          1,
                          lottery.address
                      )
                  ).to.be.revertedWith("nonexistent request");
              });

              //THIS IS THE BIG BOY!!!
              it("TEST: Lottery winner picked, lottery is reset and winnings are sent...", async function () {
                  const additionalEntrants = 3;
                  const startingAccountIndex = 1;
                  const accounts = await ethers.getSigners();

                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedLottery = lottery.connect(
                          accounts[i]
                      );
                      await accountConnectedLottery.enterLottery({
                          value: lotteryEntranceFee,
                      });
                  }
                  const startingTimeStamp = await lottery.getLatestTimeStamp();
                  await new Promise(async (resolve, reject) => {
                      lottery.once("WinnerPicked", async () => {
                          console.log("Found the Event!...");
                          try {
                              const recentWinner =
                                  await lottery.getRecentWinner();
                              const lotteryState =
                                  await lottery.getLotteryState();
                              const endingTimeStamp =
                                  await lottery.getLatestTimeStamp();
                              const numPlayers =
                                  await lottery.getNumberOfPlayers();
                              const winnerEndingBalance =
                                  await accounts[1].getBalance();
                              assert.equal(numPlayers.toString(), "0");
                              assert.equal(lotteryState.toString(), "0");
                              assert(endingTimeStamp > startingTimeStamp);

                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      lotteryEntranceFee
                                          .mul(additionalEntrants)
                                          .add(lotteryEntranceFee.toString())
                                  )
                              );
                          } catch (e) {
                              reject(e);
                          }
                          resolve();
                      });
                      const tx = await lottery.performUpkeep([]);
                      const txReceipt = await tx.wait(1);
                      const winnerStartingBalance =
                          await accounts[1].getBalance();
                      await VRFCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          lottery.address
                      );
                  });
              });
          });
      });

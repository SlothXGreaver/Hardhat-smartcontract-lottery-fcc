const { run } = require("hardhat");

const verify = async (contractAddress, args) => {
    console.log("Verifying Contract, Please Wait...");
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: args,
        });
    } catch (e) {
        if (e.message.toLowerCase().includes("already verified")) {
            console.log("Contract has already been Verified!");
        } else {
            console.log(e);
        };
    };
};

module.exports = { verify };

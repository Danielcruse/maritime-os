// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AnchorRegistry} from "../src/AnchorRegistry.sol";

/// Deploys AnchorRegistry with its deployer set as the authorized submitter.
/// Usage: forge script script/Deploy.s.sol:DeployAnchorRegistry --rpc-url <url> --broadcast
/// CHAIN_SIGNER_PRIVATE_KEY must be set in the environment.
contract DeployAnchorRegistry is Script {
    function run() external returns (AnchorRegistry) {
        uint256 deployerPrivateKey = vm.envUint("CHAIN_SIGNER_PRIVATE_KEY");
        address submitter = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);
        AnchorRegistry registry = new AnchorRegistry(submitter);
        vm.stopBroadcast();

        console.log("AnchorRegistry deployed at:", address(registry));
        console.log("Submitter:", submitter);
        return registry;
    }
}

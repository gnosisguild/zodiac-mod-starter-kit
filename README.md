# Zodiac Mod Starter Kit

A starter kit for creating Zodiac Modules and Modifiers.

The repo contains a sample based on the "Zodiac: build your own module" tutorial found [here](https://gnosis.github.io/zodiac/docs/tutorial-build-a-module/setup).

This starter kit is set up to be used with **Hardhat**. A starter kit using Foundry is available [here](https://github.com/gnosis/zodiac-mod-starter-kit/tree/foundry).

## Commands

To see available commands run `yarn hardhat`.

Some helpful commands:

```
yarn install # install dependencies
yarn hardhat deploy # compiles and deploys the contracts add the `--network` param to select a network
yarn hardhat test # runs the tests
```

## Deployment

For "normal deployment" where the master copy is used directly.

```
yarn hardhat deploy
```

This deploys the the MyModule and the test contracts (`contracts/test/Button.sol` and `contracts/test/TestAvatar.sol`) and configures it (by setting the TestAvatar as the Button owner and enabling MyModule on the TestAvatar).

### Deployment using a mastercopy and minimal proxys

For deployment modules that are going to be used for multiple avatars it can make sence to use our mastercopy/proxy pattern.
Supported chains for this option is currently: 1, 4, 100, 137, 31337 and 8001. To add support to other chains see: https://github.com/gnosis/zodiac/tree/master/src/factory#deployments.

Change the `paths.deplyment` variable from `"deploy/raw"` to `"deploy/mastercopy-proxy"`. Then run the deployment command.

<!-- TODO: turn this into a separate hardhat task so that the user does not need to edit the deploy path. -->

```
yarn hardhat task deploy
```

This deploys the MyModule mastercopy, a MyModule proxy and the test contracts (`contracts/test/Button.sol` and `contracts/test/TestAvatar.sol`) and configures it (by setting the TestAvatar as the Button owner and enabling the MyModule proxy on the TestAvatar).

<!-- TODO: create a Hardhat task for deploying the master copy and a separate task for deploying proxies. -->

## Attache your module to a Gnosis Safe

Once you have created a module and want to add it to a Gnosis Safe:

1. In the Gnosis Safe app, navigate to the "apps" tab and select the Zodiac Safe App.
2. Select "custom module", enter the address of your newly deployed module, and hit "Add Module".

It will then show up under Modules and Modifiers in the Gnosis Safe's Zodiac app.

## Helpful links

- [Zodiac Documentation](https://gnosis.github.io/zodiac/docs/intro)
- [Hardhat](https://hardhat.org/getting-started/)
- [Hardhat Deploy](https://github.com/wighawag/hardhat-deploy)

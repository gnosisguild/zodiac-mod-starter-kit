# Zodiac Mod Starter Kit

A starter kit for creating Zodiac Modules and Modifiers.

The repo contains a sample based on the "Zodiac: build your own module" tutorial found [here](https://gnosis.github.io/zodiac/docs/tutorial-build-a-module/setup).

This starter kit is set up to be used with **Foundry**. You can find Foundry installation instructions [here](https://book.getfoundry.sh/getting-started/installation.html). A starter kit using Hardhat is available [here](https://github.com/gnosis/zodiac-mod-starter-kit).

## Commands

To see available commands run `forge`.

Some helpful commands:

```
forge install # install dependencies
forge build
forge test # runs the tests
```

## Attache your module to a Gnosis Safe

Once you have created a module and want to add it to a Gnosis Safe:

1. In the Gnosis Safe app, navigate to the "apps" tab and select the Zodiac Safe App.
2. Select "custom module", enter the address of your newly deployed module, and hit "Add Module".

It will then show up under Modules and Modifiers in the Gnosis Safe's Zodiac app.

## Helpful links

- [Zodiac Documentation](https://gnosis.github.io/zodiac/docs/intro)
- [Foundry Book](https://book.getfoundry.sh/index.html)

import { ExternalLinkIcon } from '@chakra-ui/icons';
import { Box, Button, Flex, Heading, Link, Stack, Text, VStack } from '@chakra-ui/react';
import { parseEther } from '@ethersproject/units';
import { BigNumber, Contract, ethers } from 'ethers';
import Image from 'next/image';
import React, { useEffect, useState } from 'react';

import { ethersNetworkString, useEthereum, wrongNetworkToast } from '@providers/EthereumProvider';

import { maxW } from '@components/Layout';

import { CONTRACT_ADDRESS, NETWORK } from '@utils/constants';
import { debug } from '@utils/frontend';

import Birthblock from '../birthblock.json';
import BirthblockImage from '../images/example-birthblock.svg';

const heading1 = 'Fair';
const text1 =
    'Unlimited total mints with one mint per wallet. No rush to mint, no gas wars, and open to everyone.';
const heading2 = 'Naturally Scarce';
const text2 =
    'The number of possible Birthblock NFTs with 100+ rings is set by existing on-chain data instead of by an artificial limit.';
const heading3 = 'Earned';
const text3 =
    'Part of the infant category of earned NFTs where you earn attributes based on your actions. The older your wallet, the bigger your tree.';

function About({ heading, text }) {
    return (
        <VStack maxW={['sm', 'md', 'md', 'full']}>
            <Heading as="h2" fontSize="24px">
                {heading}
            </Heading>
            <Text>{text}</Text>
        </VStack>
    );
}

const toastErrorData = (title: string, description: string) => ({
    title,
    description,
    status: 'error',
    position: 'top',
    duration: 8000,
    isClosable: true,
});

function openseaLink(tokenId: number) {
    const network = NETWORK == 'ethereum' ? '' : 'testnets.';
    return `https://${network}opensea.io/assets/${CONTRACT_ADDRESS}/${tokenId}`;
}

function Home() {
    const { provider, signer, userAddress, userName, openWeb3Modal, toast } = useEthereum();

    const birthblockContract = new Contract(CONTRACT_ADDRESS, Birthblock.abi, provider);

    let [minted, setMinted] = useState(false);
    let [minting, setMinting] = useState(false);
    let [userTokenId, setUserTokenId] = useState<number>(null);

    let [freeMintsLeft, setFreeMintsLeft] = useState<number>(null);
    let [freeMints, _setFreeMints] = useState<number>(144);

    const freeMintsRef = React.useRef<number>(freeMints);
    const setFreeMints = (value: number) => {
        freeMintsRef.current = value;
        _setFreeMints(value);
    };

    useEffect(() => {
        console.log('getUserMintedTokenId');
        async function getUserMintedTokenId() {
            // userAddress has changed. TokenId defaults to null
            let tokenId = null;
            try {
                if (userAddress) {
                    const filter = birthblockContract.filters.Mint(userAddress);
                    const [event] = await birthblockContract.queryFilter(filter); // get first event, should only be one
                    if (event) {
                        tokenId = event.args[1].toNumber();
                    }
                }
            } catch (error) {
                toast(toastErrorData('Get User Minted Token Error', JSON.stringify(error)));
                debug({ error });
            } finally {
                // set it either to null, or to the userAddres's tokenId
                setUserTokenId(tokenId);
            }
        }
        getUserMintedTokenId();
    }, [userAddress]);

    // Mint Count
    useEffect(() => {
        console.log('subscribe effect');

        async function getMintedCount() {
            try {
                console.log('via load');
                const mintCount: BigNumber = await birthblockContract.mintedCount();
                const freeMints: BigNumber = await birthblockContract.freeMints();
                setFreeMints(freeMints.toNumber());
                setFreeMintsLeft(freeMints.toNumber() - mintCount.toNumber());
            } catch (error) {
                debug({ error });
            }
        }
        getMintedCount();

        birthblockContract.removeAllListeners();

        birthblockContract.on('Mint', (address: string, tokenId: BigNumber) => {
            console.log('via subscribe');

            debug({ address });
            debug({ tokenId });
            console.log('freeMints', freeMintsRef.current);
            console.log('tokenId', tokenId.toNumber());
            console.log('math', freeMints - tokenId.toNumber());
            setFreeMintsLeft(freeMintsRef.current - tokenId.toNumber());
        });
    }, []);

    const mint = async () => {
        const network = await provider.getNetwork();
        if (network.name != ethersNetworkString) {
            toast(wrongNetworkToast);
            return;
        }

        setMinting(true);
        console.log('contract address:', CONTRACT_ADDRESS);
        const birthblockContractWritable = birthblockContract.connect(signer);
        const value = freeMintsLeft ? '0' : parseEther('0.01');
        try {
            const data = await birthblockContractWritable.mint({ value });
            const moreData = await data.wait();
            debug({ moreData });
            const [_, address, tokenId] = moreData.events.find((e) => (e.event = 'Mint')).args;
            console.log('minted', address, tokenId);
            setUserTokenId(tokenId.toNumber());

            setMinting(false);
            setMinted(true);
        } catch (error) {
            // const { reason, code, error, method, transaction } = error
            setMinting(false);
            if (error?.error?.message) {
                toast(toastErrorData(error.reason, error.error.message));
            }
        }
    };

    const mintText = () => {
        if (!minting && !minted) {
            return 'Mint';
        } else if (minting) {
            return 'Minting...';
        } else if (minted) {
            return 'Minted';
        } else {
            return 'wtf';
        }
    };

    const textUnderButton = () => {
        if (userTokenId) {
            return <></>;
        } else if (freeMintsLeft === null || freeMintsLeft > 0) {
            return (
                <Text fontWeight="light" fontSize={['2xl', '3xl']}>
                    {`${freeMintsLeft || '?'}/${freeMints} free mints left`}
                </Text>
            );
        } else {
            return (
                <div>
                    <Text fontWeight="light" fontSize={['xl', '2xl']}>
                        0.01 ETH to mint
                    </Text>
                    <Text fontWeight="light" fontSize={['sm', 'md']}>
                        {`(All ${freeMintsRef.current} free mints have been minted)`}
                    </Text>
                </div>
            );
        }
    };

    return (
        <Box align="center">
            <Box px={8} pt={8} width="fit-content" mx="auto" maxW={maxW}>
                <Heading as="h1" fontSize={[54, 72, 96]} textAlign="center">
                    Birthblock
                </Heading>
                <Text fontSize={[24, 24, 36]} fontWeight="light">
                    An NFT with art and attributes based on the data from your first transaction on
                    Ethereum
                </Text>
                <Image
                    src={BirthblockImage.src}
                    alt="birthblock image"
                    width="432px"
                    height="432px"
                />
            </Box>

            <Box px={8} width="fit-content" margin="auto" maxW={maxW}>
                <Stack
                    direction={['column', 'column', 'column', 'row']}
                    align="center"
                    spacing={16}>
                    <About heading={heading1} text={text1} />
                    <About heading={heading2} text={text2} />
                    <About heading={heading3} text={text3} />
                </Stack>
            </Box>

            <VStack minH="xs" justifyContent="center" spacing={4} mt={12} px={4} bgColor="#00B8B6">
                {/* {!minted && !userTokenId ? ( */}
                <Button
                    onClick={userAddress ? mint : openWeb3Modal}
                    isLoading={minting}
                    loadingText="Minting..."
                    isDisabled={minted}
                    fontWeight="normal"
                    colorScheme="teal"
                    size="lg"
                    height="60px"
                    minW="xs"
                    boxShadow="dark-lg"
                    fontSize="4xl"
                    borderRadius="full">
                    {userAddress ? mintText() : 'Connect Wallet'}
                </Button>
                {/* ) : ( */}
                <Text fontSize={[24, 24, 36]}>
                    {`${userName}'s Birthblock (#${userTokenId}) has been minted. `}
                    <Link isExternal href={openseaLink(userTokenId)}>
                        View on Opensea <ExternalLinkIcon />
                    </Link>
                </Text>
                {/* )} */}
                {textUnderButton()}
            </VStack>
        </Box>
    );
}

export default Home;

import { Queue } from 'quirrel/next';

import { fetcher, FetcherError, ioredisClient, logger, openseaGetAssetURL, sleep } from '@utils';
import { CONTRACT_ADDRESS, networkStrings } from '@utils/constants';
import { addToIPFS, removeFromIPFS } from '@utils/ipfs';
import { Metadata } from '@utils/metadata';

import OpenseaForceUpdate from './openseaForceUpdate';

type Job = {
    url: string;
    tokenId: string;
};

export default Queue(
    'api/v1/queues/screenshot', // 👈 the route it's reachable on
    async (job: Job) => {
        const { url, tokenId } = job;

        let retries = 1;
        let imageIPFSPath = 'addToIPFS HAD AN ERROR';
        while (retries <= 3) {
            try {
                imageIPFSPath = await addToIPFS(url);
                break;
            } catch (error) {
                logger.error(`url: ${url}`);
                logger.error(`addToIPFS error: ${error}, try #${retries}`);
                retries++;
                await sleep(300);
            }
        }

        let metadataStr;
        try {
            metadataStr = await ioredisClient.hget(tokenId, 'metadata');
        } catch (error) {
            logger.error({ error, extra: 'iosredis read error' });
        }

        if (!metadataStr) {
            logger.error(`metadataStr is null for ${tokenId}`);
            return;
        }

        const metadata: Metadata = JSON.parse(metadataStr);

        if (metadata.image.includes('ipfs://')) {
            try {
                await removeFromIPFS(metadata.image);
            } catch (error) {
                logger.error({
                    error,
                    extra: 'ipfs unpin remove error',
                    ipfsUrl: metadata.image,
                    tokenId,
                });
            }
        }

        /*********************/
        /* UPDATE METADATA   */
        /*********************/
        metadata.image = imageIPFSPath;
        const address = metadata.address.toLowerCase();

        try {
            // index by wallet address
            await ioredisClient.hset(address, {
                tokenId,
                metadata: JSON.stringify(metadata),
            });
        } catch (error) {
            logger.error({ error, extra: 'iosredis write error by address' });
        }

        try {
            // index by tokenId
            await ioredisClient.hset(tokenId, {
                address: address,
                metadata: JSON.stringify(metadata),
            });
        } catch (error) {
            logger.error({ error, extra: 'iosredis write error by tokenId' });
        }

        /*********************/
        /*  UPDATE OPENSEA   */
        /*********************/

        function openseaForceUpdateURL(tokenId, contractAddress) {
            return `https://${networkStrings.openseaAPI}opensea.io/api/v1/asset/${contractAddress}/${tokenId}/?force_update=true`;
        }

        openseaGetAssetURL(tokenId, CONTRACT_ADDRESS);

        try {
            const { permalink } = await fetcher(
                openseaGetAssetURL(tokenId, CONTRACT_ADDRESS, true),
            );
            logger.info(permalink);
        } catch (error) {
            if (error instanceof FetcherError) {
                // it logs in fetcher
            } else {
                logger.error(`unkown error: ${error.name} ${error.message}`);
            }
        }

        try {
            const jobData = await OpenseaForceUpdate.enqueue(
                { tokenId, attempt: 1 },
                { delay: '15s' },
            );
        } catch (error) {
            logger.error(error);
        }
    },
);

import fs from 'node:fs/promises';

export async function readBuildInfo(artifactManager, fullyQualifiedName) {
    const id = await artifactManager.getBuildInfoId(fullyQualifiedName);
    if (id === undefined) {
        throw new Error(`No build info is associated with ${fullyQualifiedName}`);
    }

    const [inputPath, outputPath] = await Promise.all([
        artifactManager.getBuildInfoPath(id),
        artifactManager.getBuildInfoOutputPath(id),
    ]);
    if (inputPath === undefined || outputPath === undefined) {
        throw new Error(`Build info ${id} for ${fullyQualifiedName} is incomplete`);
    }

    const [inputFile, outputFile] = await Promise.all([
        fs.readFile(inputPath, 'utf8'),
        fs.readFile(outputPath, 'utf8'),
    ]);
    const buildInfo = JSON.parse(inputFile);
    const buildOutput = JSON.parse(outputFile);

    return {
        ...buildInfo,
        output: buildOutput.output,
    };
}

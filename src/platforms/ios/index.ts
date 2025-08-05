// noinspection DuplicatedCode

import { readFile, rmSync, writeFile, pathExists } from '@ionic/utils-fs';
import { mkdir} from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';

import type { AssetGeneratorOptions } from '../../asset-generator';
import { AssetGenerator } from '../../asset-generator';
import type { IosOutputAssetTemplate } from '../../definitions';
import { AssetKind, Platform } from '../../definitions';
import { BadPipelineError, BadProjectError } from '../../error';
import type { InputAsset } from '../../input-asset';
import { OutputAsset } from '../../output-asset';
import type { Project } from '../../project';


import {
  IOS_1X_UNIVERSAL_ANYANY_SPLASH,
  IOS_2X_UNIVERSAL_ANYANY_SPLASH,
  IOS_3X_UNIVERSAL_ANYANY_SPLASH,
  IOS_1X_UNIVERSAL_ANYANY_SPLASH_DARK,
  IOS_2X_UNIVERSAL_ANYANY_SPLASH_DARK,
  IOS_3X_UNIVERSAL_ANYANY_SPLASH_DARK,
} from './assets';
import * as IosAssetTemplates from './assets';


export const IOS_APP_ICON_SET_NAME = 'AppIcon';
export const IOS_APP_ICON_SET_PATH = `App/Assets.xcassets/${IOS_APP_ICON_SET_NAME}.appiconset`;
export const IOS_SPLASH_IMAGE_SET_NAME = 'Splash';
export const IOS_SPLASH_IMAGE_SET_PATH = `App/Assets.xcassets/${IOS_SPLASH_IMAGE_SET_NAME}.imageset`;

export class IosAssetGenerator extends AssetGenerator {
  constructor(options: AssetGeneratorOptions = {}) {
    super(options);
  }

  getAppIconSetPath() : string {
    if (this.options.iosIconSetName) {
      return `App/Assets.xcassets/${this.options.iosIconSetName}.appiconset`;
    }
    return IOS_APP_ICON_SET_PATH;
  }

  getSplashImageSetPath() : string {
    if (this.options.iosSplashSetName) {
      return `App/Assets.xcassets/${this.options.iosSplashSetName}.imageset`;
    }
    return IOS_SPLASH_IMAGE_SET_PATH;
  }

  async checkFolderExist(path: string): Promise<void> {
    const pathExist = await pathExists(path);

    if (!pathExist){
      await mkdir(path, {recursive: true });
    }
  }

  async checkJsonExist(path:string, content: any = {images: [], info: {}}): Promise<void> {
    const jsonExist = await pathExists(path)

    if (!jsonExist){
        await writeFile(path, JSON.stringify(content))
      }
    }
  

  async generate(asset: InputAsset, project: Project): Promise<OutputAsset[]> {
    const iosDir = project.config.ios?.path;

    if (!iosDir) {
      throw new BadProjectError('No ios project found');
    }

    if (asset.platform !== Platform.Any && asset.platform !== Platform.Ios) {
      return [];
    }

    switch (asset.kind) {
      case AssetKind.Logo:
      case AssetKind.LogoDark:
        return this.generateFromLogo(asset, project);
      case AssetKind.Icon:
        return this.generateIcons(asset, project);
      case AssetKind.Splash:
      case AssetKind.SplashDark:
        return this.generateSplashes(asset, project);
    }


    return [];
  }

  private async generateFromLogo(asset: InputAsset, project: Project): Promise<OutputAsset[]> {
    const pipe = asset.pipeline();

    if (!pipe) {
      throw new BadPipelineError('Sharp instance not created');
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const iosDir = project.config.ios!.path!;

    // Generate logos
    let logos: OutputAsset[] = [];
    if (asset.kind === AssetKind.Logo) {
      logos = await this.generateIconsForLogo(asset, project);
    }

    const generated: OutputAsset[] = [];

    const targetLogoWidthPercent = this.options.logoSplashScale ?? 0.2;
    const targetWidth = this.options.logoSplashTargetWidth ?? Math.floor((asset.width ?? 0) * targetLogoWidthPercent);

    if (asset.kind === AssetKind.Logo) {
      // Generate light splash
      const lightDefaultBackground = '#ffffff';
      const lightSplashes = [
        IOS_1X_UNIVERSAL_ANYANY_SPLASH,
        IOS_2X_UNIVERSAL_ANYANY_SPLASH,
        IOS_3X_UNIVERSAL_ANYANY_SPLASH,
      ];
      const lightSplashesGenerated: OutputAsset[] = [];

      for (const lightSplash of lightSplashes) {
        const lightDest = join(iosDir, this.getSplashImageSetPath(), lightSplash.name);

        await this.checkFolderExist(join(iosDir, this.getSplashImageSetPath()))
      
        const canvas = sharp({
          create: {
            width: lightSplash.width ?? 0,
            height: lightSplash.height ?? 0,
            channels: 4,
            background: this.options.splashBackgroundColor ?? lightDefaultBackground,
          },
        });
        const resized = await sharp(asset.path).resize(targetWidth).toBuffer();
        const lightOutputInfo = await canvas
          .composite([{ input: resized, gravity: sharp.gravity.center }])
          .png()
          .toFile(lightDest);

        const lightSplashOutput = new OutputAsset(
          lightSplash,
          asset,
          project,
          {
            [lightDest]: lightDest,
          },
          {
            [lightDest]: lightOutputInfo,
          },
        );

        generated.push(lightSplashOutput);
        lightSplashesGenerated.push(lightSplashOutput);
      }

      await this.updateSplashContentsJson(lightSplashesGenerated, project);
    }

    // Generate dark splash
    const darkDefaultBackground = '#111111';
    const darkSplashes = [
      IOS_1X_UNIVERSAL_ANYANY_SPLASH_DARK,
      IOS_2X_UNIVERSAL_ANYANY_SPLASH_DARK,
      IOS_3X_UNIVERSAL_ANYANY_SPLASH_DARK,
    ];
    const darkSplashesGenerated: OutputAsset[] = [];

    for (const darkSplash of darkSplashes) {
      const darkDestFolder = join(iosDir, this.getSplashImageSetPath(), darkSplash.name);
      await this.checkFolderExist(join(darkDestFolder, this.getSplashImageSetPath()))
      const darkDestFile = join(darkDestFolder, darkSplash.name);
      const canvas = sharp({
        create: {
          width: darkSplash.width ?? 0,
          height: darkSplash.height ?? 0,
          channels: 4,
          background: this.options.splashBackgroundColorDark ?? darkDefaultBackground,
        },
      });
      const resized = await sharp(asset.path).resize(targetWidth).toBuffer();
      const darkOutputInfo = await canvas
        .composite([{ input: resized, gravity: sharp.gravity.center }])
        .png()
        .toFile(darkDestFile);

      const darkSplashOutput = new OutputAsset(
        darkSplash,
        asset,
        project,
        {
          [darkDestFile]: darkDestFile,
        },
        {
          [darkDestFile]: darkOutputInfo,
        },
      );

      generated.push(darkSplashOutput);
      darkSplashesGenerated.push(darkSplashOutput);
    }

    await this.updateSplashContentsJsonDark(darkSplashesGenerated, project);

    return [...logos, ...generated];
  }

  private async _generateIcons(
    asset: InputAsset,
    project: Project,
    icons: IosOutputAssetTemplate[],
  ): Promise<OutputAsset[]> {
    const pipe = asset.pipeline();

    if (!pipe) {
      throw new BadPipelineError('Sharp instance not created');
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const iosDir = project.config.ios!.path!;
    const lightDefaultBackground = '#ffffff';
    const generated = await Promise.all(
      icons.map(async (icon) => {
  
        const destFolder = join(iosDir, this.getAppIconSetPath());
        await this.checkFolderExist(destFolder);

        if (this.options.iosIconSetName) {
          await this.checkFolderExist(join(iosDir, this.getAppIconSetPath()))
          const jsonDest = join(iosDir, this.getAppIconSetPath(), 'Contents.json')
          await this.checkJsonExist(jsonDest);
        }

        if (this.options.iosSplashSetName) {
          await this.checkFolderExist(join(iosDir, this.getSplashImageSetPath()))
          const jsonDest = join(iosDir, this.getSplashImageSetPath(), 'Contents.json')
          await this.checkJsonExist(jsonDest);
        }

        const destFile = join(destFolder, icon.name);

        const outputInfo = await pipe
          .resize(icon.width, icon.height)
          .png()
          .flatten({ background: this.options.iconBackgroundColor ?? lightDefaultBackground })
          .toFile(destFile);
        
        return new OutputAsset(
          icon,
          asset,
          project,
          {
            [icon.name]: destFile,
          },
          {
            [icon.name]: outputInfo,
          },
        );
      }),
    );

    await this.updateIconsContentsJson(generated, project);

    return generated;
  }

  // Generate ALL the icons when only given a logo
  private async generateIconsForLogo(asset: InputAsset, project: Project): Promise<OutputAsset[]> {
    const icons = Object.values(IosAssetTemplates).filter((a) => [AssetKind.Icon].find((i) => i === a.kind));

    return this._generateIcons(asset, project, icons as IosOutputAssetTemplate[]);
  }

  private async generateIcons(asset: InputAsset, project: Project): Promise<OutputAsset[]> {
    const icons = Object.values(IosAssetTemplates).filter((a) => [AssetKind.Icon].find((i) => i === a.kind));

    return this._generateIcons(asset, project, icons as IosOutputAssetTemplate[]);
  }

  private async generateSplashes(asset: InputAsset, project: Project): Promise<OutputAsset[]> {
    const pipe = asset.pipeline();

    if (!pipe) {
      throw new BadPipelineError('Sharp instance not created');
    }

    const assetMetas =
      asset.kind === AssetKind.Splash
        ? [IOS_1X_UNIVERSAL_ANYANY_SPLASH, IOS_2X_UNIVERSAL_ANYANY_SPLASH, IOS_3X_UNIVERSAL_ANYANY_SPLASH]
        : [
            IOS_1X_UNIVERSAL_ANYANY_SPLASH_DARK,
            IOS_2X_UNIVERSAL_ANYANY_SPLASH_DARK,
            IOS_3X_UNIVERSAL_ANYANY_SPLASH_DARK,
          ];

    const generated: OutputAsset[] = [];

    for (const assetMeta of assetMetas) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const iosDir = project.config.ios!.path!;
      const destFolder = join(iosDir, this.getSplashImageSetPath());
      await this.checkFolderExist(destFolder)
      const destFile = join(destFolder, assetMeta.name);

      const outputInfo = await pipe.resize(assetMeta.width, assetMeta.height).png().toFile(destFile);

      const g = new OutputAsset(
        assetMeta,
        asset,
        project,
        {
          [assetMeta.name]: destFile,
        },
        {
          [assetMeta.name]: outputInfo,
        },
      );

      generated.push(g);
    }

    // if (asset.kind === AssetKind.Splash) {
    //   await this.updateSplashContentsJson(generated, project);
    // } else if (asset.kind === AssetKind.SplashDark) {
    if (asset.kind === AssetKind.SplashDark) {
      // Need to register this as a dark-mode splash
      await this.updateSplashContentsJsonDark(generated, project);
    }

    return generated;
  }

  private async updateIconsContentsJson(generated: OutputAsset[], project: Project) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const assetsPath = join(project.config.ios!.path!, this.getAppIconSetPath());
    const contentsJsonPath = join(assetsPath, 'Contents.json');
    await this.checkJsonExist(contentsJsonPath, {images: [], info: {}});

    const json = await readFile(contentsJsonPath, { encoding: 'utf-8' });

    const parsed = JSON.parse(json);

    const withoutMissing = [];
    for (const g of generated) {
      const width = g.template.width;
      const height = g.template.height;

      parsed.images.map((i: any) => {
        if (i.filename !== (g.template as IosOutputAssetTemplate).name) {
          rmSync(join(assetsPath, i.filename));
        }
      });

      withoutMissing.push({
        idiom: (g.template as IosOutputAssetTemplate).idiom,
        size: `${width}x${height}`,
        filename: (g.template as IosOutputAssetTemplate).name,
        platform: Platform.Ios,
      });
    }

    parsed.images = withoutMissing;

    await writeFile(contentsJsonPath, JSON.stringify(parsed, null, 2));
  }

  private async updateSplashContentsJson(generated: OutputAsset[], project: Project) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const contentsJsonPath = join(project.config.ios!.path!, this.getSplashImageSetPath(), 'Contents.json');
    await this.checkJsonExist(contentsJsonPath, );
    const json = await readFile(contentsJsonPath, { encoding: 'utf-8' });

    const parsed = JSON.parse(json);

    const withoutMissing = parsed.images.filter((i: any) => !!i.filename);

    for (const g of generated) {
      const existing = withoutMissing.find(
        (f: any) =>
          f.scale === `${g.template.scale}x` && f.idiom === 'universal' && typeof f.appearances === 'undefined',
      );

      if (existing) {
        existing.filename = (g.template as IosOutputAssetTemplate).name;
      } else {
        withoutMissing.push({
          idiom: 'universal',
          scale: `${g.template.scale ?? 1}x`,
          filename: (g.template as IosOutputAssetTemplate).name,
        });
      }
    }

    parsed.images = withoutMissing;

    await writeFile(contentsJsonPath, JSON.stringify(parsed, null, 2));
  }

  private async updateSplashContentsJsonDark(generated: OutputAsset[], project: Project) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const contentsJsonPath = join(project.config.ios!.path!, this.getSplashImageSetPath(), 'Contents.json');
    await this.checkJsonExist(contentsJsonPath, );
    const json = await readFile(contentsJsonPath, { encoding: 'utf-8' });

    const parsed = JSON.parse(json);

    const withoutMissing = parsed.images.filter((i: any) => !!i.filename);

    for (const g of generated) {
      const existing = withoutMissing.find(
        (f: any) =>
          f.scale === `${g.template.scale}x` && f.idiom === 'universal' && typeof f.appearances !== 'undefined',
      );

      if (existing) {
        existing.filename = (g.template as IosOutputAssetTemplate).name;
      } else {
        withoutMissing.push({
          appearances: [
            {
              appearance: 'luminosity',
              value: 'dark',
            },
          ],
          idiom: 'universal',
          scale: `${g.template.scale ?? 1}x`,
          filename: (g.template as IosOutputAssetTemplate).name,
        });
      }
    }

    parsed.images = withoutMissing;

    await writeFile(contentsJsonPath, JSON.stringify(parsed, null, 2));
  }
}

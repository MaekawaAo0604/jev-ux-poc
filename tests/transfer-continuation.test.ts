import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
const api=await import('../docs/experiments/2026-10-29-transfer-continuation.js').catch(()=>({} as any));
const base=resolve('reports/transfer-evaluation-2026-10-29');
// Sanitized immutable producer metadata; no raw outcomes or credentials are needed for pure guards.
const sourceHashes:Record<string,string>={
  "app/holdout-fixture.ts": "4485df081270c755f148c43320db6a54e8effa08ae052ea407e2e799cc29821d",
  "app/HoldoutFixture.tsx": "335d3f7255ec02fd604cb3d1f37e00da750614708285e9ef1cbb10e0d7417b05",
  "app/main.tsx": "4f0c640e0df5d70ef3b1bcfb315d2408bd65b7a58b2edc292f4f733b3535cd37",
  "app/semantic-fixture.ts": "7d95b565a06d31fb57f3c7e41415e5e14ff0e8de4f8721a6b3cef9c621168862",
  "app/SemanticFixture.tsx": "8f53d4604f56b8fb048aa08190bfade3839c9e288b1e72f11168c348f24524fb",
  "app/style.css": "2f6290ed98a5506f4555451abbe01e6b316c15762ee06900ff6c8cc084c74d1c",
  "app/transfer-certification.ts": "1ef798f506b1a71899cc91bb7789a512bd61c8f706eefcba2f70fa0ffb430183",
  "app/transfer-fixture.ts": "9ee0c9e910284cb7efdb44473eb172853b0fe4070edea22d6f13ba2ff5d7367b",
  "app/transfer-style.css": "02bf7f128602a37026842d9bfd9c1ea63c6bd3e580a88a4a4b4d9216a0ecfeb3",
  "app/TransferFixture.tsx": "362f4d9b31f6c885629234ff019c29ae2207f616ccc7994d86c8b3d0e2d6a5e6",
  "app/virtual-beta-ui.ts": "37d0339b9019b55ff5ec76e90693e98bc3814a7c673b5e42dae8cb3320d6b72b",
  "pages/AccountPage.ts": "4a352f6e7f6cf85dcbf3344f808f864ef66c020d5efbb11dca23dbb1a420f182",
  "pages/action-target.ts": "10672b90c4fe551139d04ff9975a4ec94dbb6ccb1165ccb169dbbc60f103703b",
  "pages/AutoPage.ts": "ea63070c70f7c88daca0fee56040c4700bb452faf6bcebae4fa4b6a7129b34ae",
  "pages/BadPage.ts": "73c0b2a79d5cece705be786ccb33bdb1d46a8396150404fad5570950997589c4",
  "pages/ClientToolPage.ts": "e4cae05ab785027d66063a428d29f8485828a0bb48d375e48c5bf918c49d1bce",
  "pages/control-observation.ts": "baa7d28d01c3ff8834ddff005eb1dba513f48dd8a461a9fedb812f38cb32a214",
  "pages/controls.ts": "1ef93879e55fd78ae90d1a36a37f9bde10893b1bf91334baa038fd0b9fdd1f1a",
  "pages/GoodPage.ts": "91450f24a13da97eb5fbbd2f2201cc6645b90eff5ff1cede682a052e20e1fd0f",
  "pages/LocalExplorationPage.ts": "0bab94559680b80cca1f337b9e3d741160adf604e7c91e7dfcb4ade9b34974c5",
  "pages/PublicSitePage.ts": "a4d1ba466c3678a09f003d20cf6c804f1144ca0acb5231d85469b1d3f5630708",
  "pages/visible-text.ts": "fc5b928397933adf2c5166a890ae397353c894d332b0fe8d33f265ddec19fa7d",
  "pages/visual-numbering.ts": "ddce4801f03206edde19a909eab1651d2447bb04dc0906b12b30a39d308adc61",
  "jev/client.ts": "b8159e75d0eb0024369f5751a06ca254413a017204aaab3f6195116155442d4b",
  "jev/completion-frames.ts": "ca0a7ab113d87bddc181cae5a495ff56f307c2f1428909354ef43c28f08d8aa9",
  "jev/completion.ts": "c8fb0d92776db13fc062e92a13305df9cad0b505a4d53c7a5191122781e40a17",
  "jev/contradiction-batches.ts": "18e228f2fbaab96b414c1bfaa3c54bf7db866a611759f6ae1b2e82981c0bd62b",
  "jev/decide.ts": "4617336f71f53534e5b5856af7e6a676b93106f4fab0537cd4d205c1f0223871",
  "jev/evidence-blocks.ts": "47a4f144431bc38042767ec93f70fb5a201b921e901befb44481a185f2089b37",
  "jev/evidence-session.ts": "895160b8972fe9a53a096c701b3b4f6a76ae4f44b0ea3e64198b1f745ce444b9",
  "jev/fake.ts": "2749d6457f63ef426c276fa04fe06baf0362e3add9eccc441e20a683cf87d600",
  "jev/frontier-types.ts": "f58ec32e1d1b549f54b34025d5bb4ea7ce37ac6e820ebb357be43e9e982915bd",
  "jev/frontier.ts": "b96bd3b0787c086ab4cf723c401291a4fc82a4f35448794c6e25bbbd757d14d4",
  "jev/goal-completeness.ts": "c490cfdf3a64f4da124805ff161af91cb877ed2e202b616fa25e5a0e2256a70b",
  "jev/goal-evidence.ts": "e5ad5002ccb306566bfeff59a0a2746118cae556bc1cbeecab3fa913c5d1e4f8",
  "jev/goal-status.ts": "9ecd8bd3523b098ca0714af8ef0cf8608540cc4e77171c9c3e5dcf434bac8501",
  "jev/history.ts": "87fae36f54a111e16d5cefd62aeb4f312f123d987a63ca9b039272b32a0e18a6",
  "jev/image-judgments.ts": "8b88d6cc1e46cd72893bbfa2acd5447c83ce94ef75166da980edecc355bb2d54",
  "jev/image-only-input.ts": "ecf08a79577cc32e722091e4ce0a26a3209a8f088b1fe44bb34b4925acad1d50",
  "jev/navigation-context.ts": "b2e6bea86fafa05ebbf252638a3271189c53e54284baba02ed51f97e3fd56bfb",
  "jev/persona.ts": "f76235a4e2651dbc04cf47fd90b6ebaec79b60b749f747945886e5e2ca536654",
  "jev/progress.ts": "a5d775d9a4bb9841ac97d10224311dbcf28c78b39e52b8d87d7b6d7c10046bbb",
  "jev/types.ts": "1f8f6583173b6391c88069fde750e1737cfae8aa200a8d87de678019f7c5dc29",
  "jev/virtual-beta/config.ts": "828a44529126ec8efeadbebcee5caf71ac5ccb978c62800ae9e70538d7f025a2",
  "jev/virtual-beta/contracts.ts": "da844da8f1b3e525ca9fa2808af9539aca5c5c3c57001d0994ebd046b9472ea6",
  "jev/virtual-beta/correspondence-contracts.ts": "46fc64614b70e069c884320e73b66095943b9c42d007070a5ce02c0c16a82914",
  "jev/virtual-beta/correspondence.ts": "b5acf6e4c6a82caeffcc55531759486eb2292eed7e98575d8d26d36362f9cf5d",
  "jev/virtual-beta/deferral-contracts.ts": "bf49e0e32925fd4438dbb4f51803c9e5611e134478519798c75290a960af7d28",
  "jev/virtual-beta/deferral-reason-contracts.ts": "a277fbe343d2889b64b43e9d06c0f8d985219395f25d42ea90a191192a2308fb",
  "jev/virtual-beta/deferral-reason.ts": "e39f8a10866c3ac07a0e643eac09a2afde1289ca0eb29d44cc46db102c8bfea2",
  "jev/virtual-beta/deferral.ts": "171843798b205d9a5fd9354d266fe6461997335c718200abf8c5666c614b1b82",
  "jev/virtual-beta/deliberation-contracts.ts": "82dbbb7910273ede7d28beea7f46a5a4e5871160069074dd0c2bc7fa06458b7d",
  "jev/virtual-beta/deliberation.ts": "d346b812fc4f47317d47081b0aeffc8e222969caaab87314a4628036a6b42e83",
  "jev/virtual-beta/experience-contracts.ts": "953f0c765b26e725628ffafdc95f16f969bd8f907d429c6c23d6fb7a71e2044a",
  "jev/virtual-beta/experience.ts": "883a02201e6821f8d64a0d652465076c7d2fe140753ac85319da78e9d2f3a400",
  "jev/virtual-beta/goal-search-contracts.ts": "96be2464cdec5e82a9728d1fb60baaf7007f19d0502cd04f1e31b90899564f0a",
  "jev/virtual-beta/goal-search.ts": "d677800661bb4e343fe4ae8fd2feb86784735ba8d171667edca91dcbc9fde10d",
  "jev/virtual-beta/selection.ts": "284711d5f7e0900f443ba6a63381f1d7eac2ed4add6b7d2a680815a8e7488e34",
  "jev/virtual-beta/semantic-types.ts": "af474ed867ea61f608dfd8f6bbf29b48a3e37e48d0f38b089987413d28807a0b",
  "jev/virtual-beta/ui-types.ts": "aaeeb94ca7c409dd0b42ff63d8ba925458ace57b705050d8c672943a7e321b79",
  "jev/virtual-beta/user-state.ts": "b9bf78b9c9db9df10f13b8c5a4d39db31c4a3cd43ce012e80e51ab64d9ab5268",
  "jev/virtual-beta/vision.ts": "93469e77e90363e36284337b30a3590b0c9fddeeb7c16dfa845ea77cc681accc",
  "jev/visual-context.ts": "f4532fb39026b639e738778a821117ec25d7d7c47bc6838174a1796df85b1ef7",
  "runner/action-recovery.ts": "85f4e6f62e7fafc70490f27be27e513293556d89c5ebeea7a0f8d4d0037e11c1",
  "runner/action-trace.ts": "534e8bc57d22bcd8e2943fb031e9df512d4cf6265e1f18d416d4fa8f08b2ae14",
  "runner/budget-persistence.ts": "b58dfd0ef63177d0fc3fdc6112ad1cd413996ee47f22b8f19b8b7338566a4c77",
  "runner/build-public-pages.ts": "8dec6543e69fd62037c21b412b8e59c25efe8fafee13191444bd833b96af3950",
  "runner/deferral-reason-experiment.ts": "2db3872b210098728ebec45261d3e6bfcddc923174a68dd78141a8a38148584f",
  "runner/deliberation-analysis.ts": "2a5d6123d0ce5c4899fe6ee9f142e391bd7f1f1d4c810278969013bcd89acd24",
  "runner/engine.ts": "4ad3a53024d315ab40c5bbab21798f18b0c5f82bd23d5e445c3dddb9a591d814",
  "runner/exploration-memory.ts": "4571ccdad877ad704f57fc0f0ccd1d5b29be71c1226bad48176c955b57c2b54e",
  "runner/generate-test.ts": "88931c4ff967063acb741efc72376d4f9e2774e2626f0761018505c8e08729cf",
  "runner/generate.ts": "fdd14e4b948c705fde36aff86b9b2dc4af28267dc5409a8c4623a267cb3eeaa7",
  "runner/goal-diversity-fixture.ts": "6be711c40c33a9422e315b12e0931ea746b04685a2b72d048384e89c1542d2fc",
  "runner/goal-diversity.ts": "2a1fc742240ab19e298d48cf3ced0cbf0a6a227c5c02fa261c94ef4e63e6db68",
  "runner/goal-outcome.ts": "6f308337b05750aa39e23cfa095547b7981c1c053745c8fed3f4158073c7e0ff",
  "runner/holdout-analysis.ts": "aef3ac1b19fda36404b1a779804a4967bc94b1ac1d238b9a09a7085c191dc0c9",
  "runner/holdout-stability.ts": "4fb396add8834a28a6fa7219a8239d7f8e706086ff7b91c3a80ede789977eca8",
  "runner/human-jev-experiment.ts": "a1a857eed6fe3d0bbf897ea69afca18877db897ed43646b42a8feb99b29c20b1",
  "runner/human-jev-profiles.ts": "d00cdaeafbd20a9b6dc43d467c57936dc2b2848dadff0e079c4e7ab47cb2db3e",
  "runner/human-jev-review.ts": "08374866da9e93df5d04b194202cbf17bf7cb84563edf1d0cd36cebeb3bde141",
  "runner/ocr-data.ts": "c4e7d272b6d6defbf44a03e7084786c21f1f5bc61b76a287b348a94b263e68d8",
  "runner/ocr-report.ts": "38a29d598a163c53255730d5982c5436eaaa3aca082458f516b8fbd78188f751",
  "runner/ocr.ts": "b5a935b6f614e5689b7fcb686b58ebf21b35f252735342088825897a80e76973",
  "runner/persona-compare.ts": "c332b88f96f19461469fc02940a73a41ef109c14cae50a1c851d2c9c7477dccc",
  "runner/persona-diagnostics.ts": "1663d47cc5677681db8daeaf64be60b0807945c83c1ce2279e3d21352cb00c0e",
  "runner/persona-experiment.ts": "2d8d34a49594ce6d90c70fd9e6a67ad69a42809ae1106708b01cc65e7bf6bd97",
  "runner/persona-human-validation.ts": "b677ae6532f625c00a3050bbb0909115cbe824366fa7acf0648f4984f75b57f4",
  "runner/persona-human.ts": "5fbf6b46555c602cf7d1a8a03880919c4197d96c4fb4dbfead51286cfad24f2b",
  "runner/persona-phase2-html.ts": "0523c4492bc6335b0fed894cb10c3570a3d8e28c698c7003840a97cba4c94d27",
  "runner/persona-phase2.ts": "40f700792aca4de7f95eb4b6b8ad35c70186afef7c570e23dff016d71ae7d2a8",
  "runner/persona-report.ts": "465046084a9ec0dd9412b3235be9191602cdf8119f51759c7e3a494509b9dbdb",
  "runner/public-navigation.ts": "edbbeee2baffbbc98a5279d93769ef5574a71bafd77792cff3eb4ff867b43dad",
  "runner/public-options.ts": "8af7e9700f405b3d612a8363d9af44074bbb245c146316858e035d6de6e914e7",
  "runner/public-site.ts": "b6262ee067ec9036a3c18b5e1a202598f313d25937eecf701334ce26e13f601b",
  "runner/reliability-measurement.ts": "6ba19e8de089f384078b8ace57399a19ea544214557a85fe6b9bb6112f383fbb",
  "runner/reliability-source.ts": "da098483353c0c27a522b02afe61097c0b7d2ea40de098cf4b007df8d4d80723",
  "runner/reliability-validation.ts": "b21605033fd361e7c5ccc07de337eed4ec3bf8d1723046d32be5203f99dd373b",
  "runner/render.ts": "b60ed0aa5628b7aac9e424dedf28b26a192ef155e097e7a1c763ecf4959397cf",
  "runner/report-style.ts": "479a604b8da89d0fed535798aa13ba5259d316893819e9f4ebc7bcbc42be4f7a",
  "runner/report.ts": "ed1dc73ccc2677da4abbb44605698611a60f2f8190f0cc791886a4870d8676db",
  "runner/run.ts": "5875ef4aa22735929f5ee90ab32fcc08263d2907026c7af1f7eddd00808c2daf",
  "runner/semantic-analysis.ts": "17cbb72e8ac5c66db7a87dca7d9934cd6504eccb0bf4b5dfd881e6ad8bf97ac7",
  "runner/semantic-protocol.ts": "3b2d2b44d7052eaf1773bb3c5671e8d03ddd69bb8312d36f5e2d2ec0f29dce1d",
  "runner/stop-assessment.ts": "d0ecb40c45098f878734d4dd23de2ac11bd93a661aa11582a7bb1e05f23443c4",
  "runner/transfer-analysis.ts": "b45c0cb6e30446ab023a3aefda252fe76e0f3728e1a269ba9177bab4a817a43e",
  "runner/transfer-evaluation.ts": "00c3b0f6dc436d5bf2ef1a00899296110f54349e5b55d630af9925ee56faaf3a",
  "runner/transfer-oracle.ts": "9bbea44de02ca9c143f6eb2c9a2dac130d4bfa2792af078cf7fed37434457b30",
  "runner/virtual-beta-analysis.ts": "8684b4c0e4ea7e908ed0f995c4abcb21304351fc616d8ebc284ca43091c4178b",
  "runner/virtual-beta-budget.ts": "03ee80e3eabccdd26fc4fa17f6f945074c59d4392484e1dd1f1b45842064d41b",
  "runner/virtual-beta-core.ts": "fe0d6abe606a366bae75e430fe5066e172553e8270740f1d750d1f014f514507",
  "runner/virtual-beta-evaluator.ts": "54ddddadd50a5a44f583bea9fe3b1309f42c164857f824edd3a480ae440695ed",
  "runner/virtual-beta-replay-candidates.ts": "cce8801b1d8b6e27aefc8e0b1e33dc62d3246ebe06463777361cba31cf17a6a8",
  "runner/virtual-beta-replay.ts": "34dc1c423e584c596cfaa5b90de2f3ca675d562596ac03342b91e7ed1ebdb50b",
  "runner/virtual-beta-source.ts": "27a647eba569333695ad2b218387998777e25f30c7deaadda6cc94757e0ec238",
  "runner/virtual-beta.ts": "08e8161077a2fc9ac28dae0e45bbc09cedce9479f31e15828bac586166bbbca7",
  "runner/vision-audit.ts": "b4533b4c361af065df93f97a40064cee2732bff515cbdd0470118395236e7603",
  "runner/vision-outcome-validation.ts": "aac41057c892d0dc9d337ff70ea5a723019cb95ba4ee8a5cbb90be0c62621ac9",
  "runner/vision-replay.ts": "a96d98dafe2737a84ce69d4530b870c3c310078c18878af47e832bd7bc834f97",
  "runner/vision-smoke.ts": "40cc45b5a1dada494fbe2e486aa311bfe12259b1d9c995521f3005b1e7b25766",
  "runner/vision-validation.ts": "023db50ce14ee6147851ffa175e16d7f3c2d1605c034f4f2e4835ce8c5be3382",
  "runner/visual-detail.ts": "3815566ff0e055b66582c179b19a00107ddea41072a4feca6cdb679c84750ac7",
  "runner/visual-evidence.ts": "cba6f3e0038e6d0f2f45cac99371031eac1da3a36a9a8200d076038b6fe57ebb",
  "runner/visual-ocr.ts": "84100047bfb41228cdda6ea4a8981bcc6acb0168ea4cc549b770804a77f1b9e6",
  "runner/windows-ocr.ts": "64b5a09126225d64f71579039fd0cc2b2c5b671fbd57ca0936937c2d5ef221df",
  "package.json": "b5c7674ccf897de78f4800950a123983c828c223f7daba5b3af4c5806b8e50aa",
  "package-lock.json": "0eb88ce57373a896eacfba5e501269dbbda9a435414fababb44270f177e0c5c9",
  "tests/goals.ts": "12533a175f1fdb0be7fa4a26064fb44d5ce9b447b0618ca8d42789625c4d96d5",
  "index.html": "e432d6bf6d82673a7deab3318a9c639169047d11c6a9829de1ed27a20bf6de24"
};
const canonical=[
  {
    "id": "transfer-sentinel-direct-alpha-r1",
    "replicate": 1,
    "kind": "sentinel",
    "fixture": {
      "task": "direct",
      "variant": "alpha"
    }
  },
  {
    "id": "transfer-catalog-alpha-r1",
    "replicate": 1,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "catalog",
      "variant": "alpha"
    }
  },
  {
    "id": "transfer-catalog-beta-r1",
    "replicate": 1,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "catalog",
      "variant": "beta"
    }
  },
  {
    "id": "transfer-draft-alpha-r1",
    "replicate": 1,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "draft",
      "variant": "alpha"
    }
  },
  {
    "id": "transfer-draft-beta-r1",
    "replicate": 1,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "draft",
      "variant": "beta"
    }
  },
  {
    "id": "transfer-help-alpha-r1",
    "replicate": 1,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "help",
      "variant": "alpha"
    }
  },
  {
    "id": "transfer-help-beta-r1",
    "replicate": 1,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "help",
      "variant": "beta"
    }
  },
  {
    "id": "transfer-sentinel-direct-alpha-r2",
    "replicate": 2,
    "kind": "sentinel",
    "fixture": {
      "task": "direct",
      "variant": "alpha"
    }
  },
  {
    "id": "transfer-draft-alpha-r2",
    "replicate": 2,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "draft",
      "variant": "alpha"
    }
  },
  {
    "id": "transfer-draft-beta-r2",
    "replicate": 2,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "draft",
      "variant": "beta"
    }
  },
  {
    "id": "transfer-help-alpha-r2",
    "replicate": 2,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "help",
      "variant": "alpha"
    }
  },
  {
    "id": "transfer-help-beta-r2",
    "replicate": 2,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "help",
      "variant": "beta"
    }
  },
  {
    "id": "transfer-catalog-alpha-r2",
    "replicate": 2,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "catalog",
      "variant": "alpha"
    }
  },
  {
    "id": "transfer-catalog-beta-r2",
    "replicate": 2,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "catalog",
      "variant": "beta"
    }
  },
  {
    "id": "transfer-sentinel-direct-alpha-r3",
    "replicate": 3,
    "kind": "sentinel",
    "fixture": {
      "task": "direct",
      "variant": "alpha"
    }
  },
  {
    "id": "transfer-help-alpha-r3",
    "replicate": 3,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "help",
      "variant": "alpha"
    }
  },
  {
    "id": "transfer-help-beta-r3",
    "replicate": 3,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "help",
      "variant": "beta"
    }
  },
  {
    "id": "transfer-catalog-alpha-r3",
    "replicate": 3,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "catalog",
      "variant": "alpha"
    }
  },
  {
    "id": "transfer-catalog-beta-r3",
    "replicate": 3,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "catalog",
      "variant": "beta"
    }
  },
  {
    "id": "transfer-draft-alpha-r3",
    "replicate": 3,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "draft",
      "variant": "alpha"
    }
  },
  {
    "id": "transfer-draft-beta-r3",
    "replicate": 3,
    "kind": "novel",
    "fixture": {
      "version": 1,
      "task": "draft",
      "variant": "beta"
    }
  }
];
const method={mode:'experience-goal-search-grounded',profile:humanJevProfile('experience-goal-search-grounded'),persona:null,longContext:true,maxAttemptsPerRequest:1};
const protocol={file:'experiments/virtual-beta/transfer-evaluation.json',sha256:'ae65d167928aa0990acc17c9e27944f28c9f2133c537f2436c28f0d3f883163b'};
const counts=[6,6,8,8,8,8,8,6,8,8,8,8,2];
const previous={schemaVersion:1,status:'HTTP_402',mock:false,revision:'73b1ff3603b84c0019332970590b1f0d1406dc91',sourceHash:'8a5bc5c03daaf99df38795fd218dc5e19e0ed916d390620e602286955c6ee3d7',sourceHashes,charterSha256:'0eb9deca2bc00c4cbbc4878d3ab89ea1b528848215dd3d59a731e301d6313e38',protocol,method,schedule:canonical,records:canonical.slice(0,13).map((slot:any,index:number)=>({...slot,slotId:slot.id,runId:'previous-'+slot.id,status:'RESULT',requests:counts[index]})),totalRequests:92,limits:{maxRequests:504}};
const digest='db9857b740a995ea208bd5f4e9111c493bc00851c31e9ea88255a7856e87cf93';
const pending={producer:{revision:previous.revision,sourceHash:previous.sourceHash,protocol,method},stoppedManifestSha256:digest,stoppedStatus:'HTTP_402',attempted:13,requestsCharged:92,remainingSlots:canonical.slice(13),remainingTrialLimit:8,remainingRequestLimit:192,combinedRequestUpperBound:284,retryFailedSlot:false};
let history:any;
try{history=JSON.parse(await readFile(join(base,'live','manifest.json'),'utf8'));await lstat(resolve('../../transfer-frozen-continuation/Ux_test'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')history=undefined;else throw error;}
const make=()=>({previous:structuredClone(previous),pending:structuredClone(pending),canonical:structuredClone(previous.schedule),previousSha256:digest});
const options=()=>({previous:join(base,'live','manifest.json'),pending:join(base,'pending-slots.json'),priorSnapshot:join(base,'prior-originals.json'),frozenRoot:resolve('../../transfer-frozen-continuation/Ux_test'),out:join(base,'unit-output-never-created'),mock:true});

test('continuation selects exactly the canonical unattempted eight and never the HTTP402 failure',()=>{
 assert.equal(typeof api.planTransferContinuation,'function','pure continuation guard must exist');
 const plan=api.planTransferContinuation(make());
 assert.deepEqual(plan.continuationSchedule.map((s:any)=>s.id),['transfer-catalog-beta-r2','transfer-sentinel-direct-alpha-r3','transfer-help-alpha-r3','transfer-help-beta-r3','transfer-catalog-alpha-r3','transfer-catalog-beta-r3','transfer-draft-alpha-r3','transfer-draft-beta-r3']);
 assert.ok(!plan.continuationSchedule.some((s:any)=>s.id==='transfer-catalog-alpha-r2'));assert.equal(plan.previousRequests,92);assert.equal(plan.limits.trials,8);assert.equal(plan.limits.maxRequests,192);assert.equal(plan.combinedRequestUpperBound,284);assert.equal(plan.schedule.length,21);
 const failed=make();failed.previous.records[12].status='FAILED';assert.deepEqual(api.planTransferContinuation(failed).continuationSchedule,plan.continuationSchedule);
});
test('continuation rejects changed previous digest and mismatched pending producer or limits',()=>{
 assert.equal(typeof api.planTransferContinuation,'function');
 const badHash=make();badHash.previousSha256='0'.repeat(64);assert.throws(()=>api.planTransferContinuation(badHash),/PREVIOUS_MANIFEST_HASH/);
 for(const mutate of [(x:any)=>x.pending.producer.method.longContext=false,(x:any)=>x.pending.remainingRequestLimit=193,(x:any)=>x.pending.retryFailedSlot=true,(x:any)=>x.previous.totalRequests=93,(x:any)=>x.previous.sourceHashes['runner/transfer-analysis.ts']='0'.repeat(64)]){
  const input=make();mutate(input);assert.throws(()=>api.planTransferContinuation(input));
 }
});
test('continuation rejects duplicates, overlap, unknown slots, nonprefix history and suffix reordering',()=>{
 for(const mutate of [(x:any)=>x.previous.records[1]=x.previous.records[0],(x:any)=>x.pending.remainingSlots[1]=x.pending.remainingSlots[0],(x:any)=>x.pending.remainingSlots[0]=x.canonical[12],(x:any)=>x.pending.remainingSlots[0].id='unknown',(x:any)=>[x.previous.records[0],x.previous.records[1]]=[x.previous.records[1],x.previous.records[0]],(x:any)=>[x.pending.remainingSlots[0],x.pending.remainingSlots[1]]=[x.pending.remainingSlots[1],x.pending.remainingSlots[0]],(x:any)=>x.previous.records.pop()]){
  const input=make();mutate(input);assert.throws(()=>api.planTransferContinuation(input));
 }
});
test('continuation requires absolute explicit inputs and keeps real injection and mock credentials forbidden',async()=>{
 assert.equal(typeof api.validateContinuationOptions,'function','option guard must exist');
 for(const mutate of [(x:any)=>x.frozenRoot='relative',(x:any)=>x.previous='',(x:any)=>delete x.priorSnapshot,(x:any)=>x.mock=undefined,(x:any)=>x.envFile='E:/secret.env']){
  const input=options();mutate(input);assert.throws(()=>api.validateContinuationOptions(input));
 }
 const real={...options(),mock:false,envFile:'E:/ChatGPT/Ux_test/.env'};
 await assert.rejects(()=>api.runTransferContinuation(real,async()=>({})),/MOCK_ONLY/);
 assert.throws(()=>api.validateContinuationOptions({...real,envFile:join(real.frozenRoot,'.env')}),/EXTERNAL_ENV/);
});
test('an existing output directory is rejected before any frozen module, credential or trial is loaded',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'continuation-existing-'));
 try{await assert.rejects(()=>api.runTransferContinuation({...options(),out:dir,frozenRoot:join(dir,'missing')},async()=>({})),{code:'EEXIST'});}finally{await rm(dir,{recursive:true,force:true});}
});

test('bounded mock continuation stops after two infrastructure failures and ignores latency value402',{skip:history?false:'Historical stopped batch and frozen producer absent'},async()=>{
 const {mkdir,writeFile}=await import('node:fs/promises');const dir=await mkdtemp(join(tmpdir(),'continuation-mock-')),cwd=process.cwd();let calls=0;
 try{
  const out=join(dir,'out');const outcome=await api.runTransferContinuation({...options(),out},async(input:any)=>{
   calls++;if(calls>1)throw {statusCode:503};await mkdir(input.out);await writeFile(join(input.out,'initial-product.png'),'unit-initial');const result=structuredClone(history.records[1].result);result.runId=input.runId;result.apiMs=402;result.apiCalls=0;return {result};
  });
  const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));assert.equal(outcome.status,'CONSECUTIVE_INFRASTRUCTURE_FAILURES');assert.equal(outcome.trials,3);assert.equal(calls,3);assert.equal(outcome.requests,0);assert.equal(outcome.combinedRequests,92);assert.equal(manifest.records[0].id,'transfer-catalog-beta-r2');assert.equal(manifest.preservationAfter.unchanged,true);assert.equal(manifest.preservationAfter.liveFiles,299);assert.equal(process.cwd(),cwd);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('bounded mock continuation stops immediately on HTTP402 and rejects per-trial request overflow',{skip:history?false:'Historical stopped batch and frozen producer absent'},async()=>{
 const {mkdir,writeFile}=await import('node:fs/promises');const dir=await mkdtemp(join(tmpdir(),'continuation-stop-'));
 try{
  let calls=0;const payment=await api.runTransferContinuation({...options(),out:join(dir,'payment')},async()=>{calls++;throw {statusCode:402};});assert.equal(payment.status,'HTTP_402');assert.equal(payment.trials,1);assert.equal(calls,1);
  const out=join(dir,'cap');await assert.rejects(()=>api.runTransferContinuation({...options(),out},async(input:any)=>{await mkdir(input.out);await writeFile(join(input.out,'initial-product.png'),'unit-initial');const result=structuredClone(history.records[1].result);result.runId=input.runId;result.apiCalls=25;return {result};}),/TRIAL_CAP_EXCEEDED/);
  const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));assert.equal(manifest.status,'BATCH_ERROR');assert.equal(manifest.records.length,1);assert.equal(manifest.records[0].result.apiCalls,25);assert.equal(manifest.preservationAfter.unchanged,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});

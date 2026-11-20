# Bằng chứng on-chain (Avalanche Fuji)

> Đây là **giao dịch kiểm thử** do nhóm chạy bằng các ví test (`npm run seed:scenarios`), không phải người dùng thật. Mục đích: chứng minh mọi luồng của contract chạy thật trên Fuji. File được tạo tự động từ `deployments/scenarios-43113-*.json`.

Contract: [EcoLoopPickup V4](https://testnet.snowtrace.io/address/0x6C0309FD70255cC87d53B14c71F17Ba75b131b8f) · [Forwarder](https://testnet.snowtrace.io/address/0xfdA90d9becdF9F6019c9D042CadE9DC61AB2C2ED) · [ECOREC](https://testnet.snowtrace.io/address/0x49487c0656713535c416097E988c447a86DD5a6B) · [Rewards](https://testnet.snowtrace.io/address/0x6E46f3e458E123fc665D23Aa0D9dc18b6af10fBd)

| Chỉ số | Giá trị |
|---|---|
| Giao dịch trong kịch bản | 161 |
| Trong đó miễn gas (ERC-2771 qua relayer) | 76 |
| Số ví tham gia | 12 |
| Tổng số lô trên contract | 25 |
| Chứng nhận ECOREC đã đúc | 20 |
| Khối lượng đã xác minh | 142.7 kg |
| ECO đã trả từ ký quỹ | 2589.80 |

## A · Trạm xác minh khóa ký quỹ ECO 120%

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `createLot` | household-1 | #1 | relayer trả | [0xa06a9a84…](https://testnet.snowtrace.io/tx/0xa06a9a842046973cb0be697b990c3bc91f7e432c125e36643d01eb2d828773dc) |
| `claimLot` | station | #1 | ví tự trả | [0x1ffc5938…](https://testnet.snowtrace.io/tx/0x1ffc5938fe22a00c3d347f44acd40fa21411357161439c7d2e9c1685cfa81d02) |
| `proposeLot` | station | #1 | ví tự trả | [0x8fc3a506…](https://testnet.snowtrace.io/tx/0x8fc3a50627463e0369d375e22f5144a2eb0018625e4420b0016d608c18f7da65) |
| `acceptLot` | household-1 | #1 | relayer trả | [0xfca3bcc1…](https://testnet.snowtrace.io/tx/0xfca3bcc130f204121aaf56682b983c515a20403dc798d99c59a65e5fed2e0ee6) |
| `createLot` | household-7 | #7 | relayer trả | [0x07e6f00e…](https://testnet.snowtrace.io/tx/0x07e6f00e2f441d21be9e7a3a06779207cb9693410d2fd9187269367167caa59f) |
| `claimLot` | station | #7 | ví tự trả | [0xd2f18db8…](https://testnet.snowtrace.io/tx/0xd2f18db803b8bd6166826035b550631d4cc699621897e390b68cfd79576fc5c1) |
| `proposeLot` | station | #7 | ví tự trả | [0xce3a0ee8…](https://testnet.snowtrace.io/tx/0xce3a0ee891537305ddbf3bda0575839310ed6dfc1480149597de0d1eb03c3095) |
| `acceptLot` | household-7 | #7 | relayer trả | [0x782edb77…](https://testnet.snowtrace.io/tx/0x782edb77b745f8da440753069b023cc830cba9c8d7f04ed1844a95f135680621) |
| `createLot` | household-4 | #12 | relayer trả | [0x55d62752…](https://testnet.snowtrace.io/tx/0x55d627521d4fa9ab34d91fd6cfe2758da5c8f5029fc4bc445aa16fb966a184f5) |
| `claimLot` | station | #12 | ví tự trả | [0xf49a067d…](https://testnet.snowtrace.io/tx/0xf49a067d2ec906a8619fc065c88cc12c67f0bcd81af68b980726c3b99c7f01a9) |
| `proposeLot` | station | #12 | ví tự trả | [0x9814be05…](https://testnet.snowtrace.io/tx/0x9814be05f86ee2c5501f2c29dc09549ed25fe978bf498744173286f532c7a0ec) |
| `acceptLot` | household-4 | #12 | relayer trả | [0x696b9092…](https://testnet.snowtrace.io/tx/0x696b9092f077cf36088d6c414eb81c871b83e8238b8ee3be6c41ab08f6c9fcfc) |
| `createLot` | household-2 | #18 | relayer trả | [0x26ec73af…](https://testnet.snowtrace.io/tx/0x26ec73afafc77142af14dadfdc81c3a2f771154fa102b9173c02123c13ab0d4c) |
| `claimLot` | station | #18 | ví tự trả | [0xb21b5acf…](https://testnet.snowtrace.io/tx/0xb21b5acfd141a4404a5dedba504c989190a25b2c2d9082758dfa1a0a3b6df2d9) |
| `proposeLot` | station | #18 | ví tự trả | [0x89021c59…](https://testnet.snowtrace.io/tx/0x89021c5995f541a17051a2c883f90c6b977e624e6b2cb38b2c4d12d2baa1dc14) |
| `acceptLot` | household-2 | #18 | relayer trả | [0x5dd10500…](https://testnet.snowtrace.io/tx/0x5dd10500ae146ce5394b497bfdc05590f3ab41758a9bd2a67eaf99d2781cbddb) |

## B · Trạm 0 ECO/0 AVAX dùng quỹ ứng trước (toàn bộ miễn gas)

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `createLot` | household-2 | #2 | relayer trả | [0x650895ed…](https://testnet.snowtrace.io/tx/0x650895eda9721e5a027590454c213a91bddbcee92229778b894282a57f22eb42) |
| `claimLotSponsored` | station-sponsored | #2 | relayer trả | [0x71d57e8e…](https://testnet.snowtrace.io/tx/0x71d57e8eb8e71519eebf2802cd5189b9029f8ef18e71f8b0831fd6b65fe2fec3) |
| `proposeLot` | station-sponsored | #2 | relayer trả | [0xce9475a0…](https://testnet.snowtrace.io/tx/0xce9475a083e58db9ce267a2c302e4ab4ccf06162cc73400877492e443bb75da2) |
| `acceptLot` | household-2 | #2 | relayer trả | [0x58452534…](https://testnet.snowtrace.io/tx/0x58452534889839267f5d35c556cd6d9d7d1c7e1fd9e1e4ecb41a7a2f8d54f879) |
| `createLot` | household-8 | #8 | relayer trả | [0xc19ebb10…](https://testnet.snowtrace.io/tx/0xc19ebb1053efa77651e2d2286047aec4bc039f4bce733a39b39cb8b5fdfd5317) |
| `claimLotSponsored` | station-sponsored | #8 | relayer trả | [0x525a08e9…](https://testnet.snowtrace.io/tx/0x525a08e9b05119afbd45088018c65b6f6b30fbfdceec7001b3df307a2bf0b2ce) |
| `proposeLot` | station-sponsored | #8 | relayer trả | [0x4646a703…](https://testnet.snowtrace.io/tx/0x4646a703a3f10139877fbd9fa5dcdc7a97be1983bbb0c1211db09e59b960cf2c) |
| `acceptLot` | household-8 | #8 | relayer trả | [0x9b2e0383…](https://testnet.snowtrace.io/tx/0x9b2e0383a3de0cd155a3de800ec96d3b97c75bd6039d3e341c06e50e90c94b76) |
| `createLot` | household-5 | #13 | relayer trả | [0xa5b50531…](https://testnet.snowtrace.io/tx/0xa5b50531222c1e1063254af31d0b411bb3e504235af2daacf44b3ed639f39d34) |
| `claimLotSponsored` | station-sponsored | #13 | relayer trả | [0xf17a938d…](https://testnet.snowtrace.io/tx/0xf17a938ddb88a276368e745df58bdfe0d4e331579802c9857aeca8e31c0ffea6) |
| `proposeLot` | station-sponsored | #13 | relayer trả | [0xeaac4e03…](https://testnet.snowtrace.io/tx/0xeaac4e03151d0904a40b39d34d1642234c51568be38367e5c3bd37adddc05a06) |
| `acceptLot` | household-5 | #13 | relayer trả | [0xe77ece9d…](https://testnet.snowtrace.io/tx/0xe77ece9d67bd6278bc86f98c2de0a82e344e0b7297c12a19e67c6d1b9b7b2255) |
| `createLot` | household-3 | #19 | relayer trả | [0x5c5ee4b8…](https://testnet.snowtrace.io/tx/0x5c5ee4b892709e63c42deb55a5669aca2db34f15ebef68324c7d02097f19330c) |
| `claimLotSponsored` | station-sponsored | #19 | relayer trả | [0x6734e86c…](https://testnet.snowtrace.io/tx/0x6734e86c55ac71a5d790eb30dca437ec795f0da53480b663ab43841244fcfc7c) |
| `proposeLot` | station-sponsored | #19 | relayer trả | [0x4450cd8f…](https://testnet.snowtrace.io/tx/0x4450cd8f6f8b89f76b3449a21fe9214404c996daee5e5bd673871e445a029078) |
| `acceptLot` | household-3 | #19 | relayer trả | [0x924768ca…](https://testnet.snowtrace.io/tx/0x924768ca42f608e760718295ca3c5b9c022c62ee445f4b5e123fec242ccfa049) |

## C · Người thu gom chưa xác minh (P2P, NFT không verified)

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `createLot` | household-3 | #3 | relayer trả | [0x4cebe86b…](https://testnet.snowtrace.io/tx/0x4cebe86b883f77c1d524a6a1e2502b098c066da8eb1862ba437f2993e8025cd8) |
| `claimLot` | collector-p2p | #3 | ví tự trả | [0x7cb0e5f0…](https://testnet.snowtrace.io/tx/0x7cb0e5f0febdc51db2075e7ddbac3d487ddb44dd9b8bf71b7565bc46e973d06e) |
| `proposeLot` | collector-p2p | #3 | ví tự trả | [0xa8b1d75c…](https://testnet.snowtrace.io/tx/0xa8b1d75cff2514c5421e648dd529bca0c492bd784cbc901e1455a9238c3ef91c) |
| `acceptLot` | household-3 | #3 | relayer trả | [0xbcabc731…](https://testnet.snowtrace.io/tx/0xbcabc73125b058fc3d753f70ec4646b3088b45fad6d9d4e968e7951e2a033fe9) |
| `createLot` | household-1 | #9 | relayer trả | [0xe7e445b4…](https://testnet.snowtrace.io/tx/0xe7e445b47cd4d1bf59ec7fc6759ad4e2b022092402abe8e4e876fe34133a22fa) |
| `claimLot` | collector-p2p | #9 | ví tự trả | [0xaced7621…](https://testnet.snowtrace.io/tx/0xaced76215af80aca6cbf2a63dabe8494d5a1f861139b4d08492bc7dc8eb2c4c8) |
| `proposeLot` | collector-p2p | #9 | ví tự trả | [0x795b4689…](https://testnet.snowtrace.io/tx/0x795b4689b6df10b7beb29b0b02f85daeb6d81f94ceea8ddcb54956ca8477dd7a) |
| `acceptLot` | household-1 | #9 | relayer trả | [0xae78068a…](https://testnet.snowtrace.io/tx/0xae78068a219b6ee862ee11ade7730a4b7574d8381ee5059d526d7b30c7dab8e1) |
| `createLot` | household-6 | #14 | relayer trả | [0x3b18ee79…](https://testnet.snowtrace.io/tx/0x3b18ee793ab019122135c4a73c4fb51be6257da6dbe419c43227b7b391e80a99) |
| `claimLot` | collector-p2p | #14 | ví tự trả | [0xfb5b9243…](https://testnet.snowtrace.io/tx/0xfb5b9243be24ac09aba0f96420985f0b793271ccd94c57390b6e87e0093c9272) |
| `proposeLot` | collector-p2p | #14 | ví tự trả | [0xf3afde5f…](https://testnet.snowtrace.io/tx/0xf3afde5f9857931f1216307e765f4b861456a658d3a3f31a0a96856f2f024cb6) |
| `acceptLot` | household-6 | #14 | relayer trả | [0x98842cb1…](https://testnet.snowtrace.io/tx/0x98842cb11f55ae07767139b5bc73d14e867835209bc356bfe82cdc1693525fe8) |
| `createLot` | household-4 | #20 | relayer trả | [0xdc60ee1a…](https://testnet.snowtrace.io/tx/0xdc60ee1abc04708c896ded8d5544824d68343e9560ea72c9e9890e8aa0f60ece) |
| `claimLot` | collector-p2p | #20 | ví tự trả | [0x24dac229…](https://testnet.snowtrace.io/tx/0x24dac2293f5f0cf5ca29ae2052a4d094d627df143c0283ca1a33c4fefd289756) |
| `proposeLot` | collector-p2p | #20 | ví tự trả | [0xd6c80852…](https://testnet.snowtrace.io/tx/0xd6c8085211cde6ec3396918db6586daa22e1b7b50af7cd825e6e007e75a2fe86) |
| `acceptLot` | household-4 | #20 | relayer trả | [0xeb2b60c9…](https://testnet.snowtrace.io/tx/0xeb2b60c9befc4009c80c6f878cdb24756b20a634adb8cbb0edfdba135fa1d5aa) |

## D · Hộ dân yêu cầu cân lại rồi chấp nhận

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `createLot` | household-4 | #4 | relayer trả | [0x248f9bce…](https://testnet.snowtrace.io/tx/0x248f9bce63771eb1346eec266142b07829ff2b657207aee62c3393d2e3217165) |
| `claimLot` | station | #4 | ví tự trả | [0x96749e00…](https://testnet.snowtrace.io/tx/0x96749e00b7ea8e0f523f69850d4106dbab01d0a7b43f5a43d9cce1fe72122764) |
| `proposeLot` | station | #4 | ví tự trả | [0x7ae9b872…](https://testnet.snowtrace.io/tx/0x7ae9b8723f2768220d9c8703157b0c1e793b27e34b42ae542382d99cf92e7d57) |
| `disputeLot` | household-4 | #4 | relayer trả | [0xa30cdbb5…](https://testnet.snowtrace.io/tx/0xa30cdbb5f34d502391e45c156a00512ac854d763885be513f24084ebadf47499) |
| `proposeLot` | station | #4 | ví tự trả | [0x30be0229…](https://testnet.snowtrace.io/tx/0x30be022998045b9adb47f010e0cc8dab3e770d85503c3d65971ab71117116336) |
| `acceptLot` | household-4 | #4 | relayer trả | [0x63ceb851…](https://testnet.snowtrace.io/tx/0x63ceb8517a1e8e9d0f183d6658a7bb73a6f02723d9b8610d1dde542d573742fd) |
| `createLot` | household-2 | #10 | relayer trả | [0xf7ee2c85…](https://testnet.snowtrace.io/tx/0xf7ee2c85b50e07a3601617202c11444730a733f96057405bef0e35cfa5f707c9) |
| `claimLot` | station | #10 | ví tự trả | [0xf1782ed7…](https://testnet.snowtrace.io/tx/0xf1782ed7745bc0192447fd9de6b27ec07f46371303648b2ee03cab8d5e648138) |
| `proposeLot` | station | #10 | ví tự trả | [0x2df7bf4a…](https://testnet.snowtrace.io/tx/0x2df7bf4a4665febfff4d5b87e1bdcf5f4d1f0d4de57bb6b87d35d9ffec4646e5) |
| `disputeLot` | household-2 | #10 | relayer trả | [0x9c6181f1…](https://testnet.snowtrace.io/tx/0x9c6181f1f0c89d48b4251e1829e2ab8cd65866256a176efe8c5d367df74f049b) |
| `proposeLot` | station | #10 | ví tự trả | [0x43cb8067…](https://testnet.snowtrace.io/tx/0x43cb806741946496778c8a3c01c656fbf07c736595f8578894c98a7e12f712cb) |
| `acceptLot` | household-2 | #10 | relayer trả | [0x6e1fbd1d…](https://testnet.snowtrace.io/tx/0x6e1fbd1dcf514b07b7d51f6deba88172624a3c9454de2c4067ff397e78951949) |
| `createLot` | household-7 | #15 | relayer trả | [0x34ff2c76…](https://testnet.snowtrace.io/tx/0x34ff2c76421154412d8e27d17d99f2f7fcace671d4e0c25af51ade89035fd145) |
| `claimLot` | station | #15 | ví tự trả | [0x35bdeb23…](https://testnet.snowtrace.io/tx/0x35bdeb23fbbf56264b896186b2544c78f0566cd82d089f5b94196805e5192d9a) |
| `proposeLot` | station | #15 | ví tự trả | [0x52561a33…](https://testnet.snowtrace.io/tx/0x52561a337be89198e8d39eeb2ff4fc411315bfb3f1aa78b9c28adb47aadb5f16) |
| `disputeLot` | household-7 | #15 | relayer trả | [0x8946d92b…](https://testnet.snowtrace.io/tx/0x8946d92bbfb0f7a65daddeb6f2821bdec0b1e8b4e408af58bf2bb1d60938f72a) |
| `proposeLot` | station | #15 | ví tự trả | [0x3e6eda9f…](https://testnet.snowtrace.io/tx/0x3e6eda9fed15cb08ec9884e7dde4d58576b2feac54a993e57e88cf4d4e69c6fa) |
| `acceptLot` | household-7 | #15 | relayer trả | [0x672c382a…](https://testnet.snowtrace.io/tx/0x672c382afa150e7003e7512609d26d332b1537ff415826393b6b684e4f6360d4) |
| `createLot` | household-5 | #21 | relayer trả | [0x633bd88c…](https://testnet.snowtrace.io/tx/0x633bd88c7c4b1f1eced3dda02a274df7a0d347ef8cfe970ed129ad647bc03b88) |
| `claimLot` | station | #21 | ví tự trả | [0xf8a35f86…](https://testnet.snowtrace.io/tx/0xf8a35f867fbe8109a28bbb8afef624e3b6a1ef00f7f0922745172d047353977a) |
| `proposeLot` | station | #21 | ví tự trả | [0x43d636b1…](https://testnet.snowtrace.io/tx/0x43d636b1c75a022df502ceba7d2e7cac562abd51101222dc18bfaf62924dbc14) |
| `disputeLot` | household-5 | #21 | relayer trả | [0x3700fd91…](https://testnet.snowtrace.io/tx/0x3700fd91a478741905c05b2127c39e5f624c4ea39c00493340989c56e36d0855) |
| `proposeLot` | station | #21 | ví tự trả | [0x916bdc1a…](https://testnet.snowtrace.io/tx/0x916bdc1aa1d1b4939ae4996529339e4ad2bae7238b4e1c5210a45bcbc8675b22) |
| `acceptLot` | household-5 | #21 | relayer trả | [0x9f6a3a0b…](https://testnet.snowtrace.io/tx/0x9f6a3a0b020568fb06b791daa11865f0dc340c819aacf798b0fa2a7e3cf33b39) |

## E · Trả đơn (hoàn 100% ký quỹ), trạm khác nhận tiếp

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `createLot` | household-5 | #5 | relayer trả | [0xbd50e8ab…](https://testnet.snowtrace.io/tx/0xbd50e8ab3a11ea8aebf04629f9bcdf53b60ccf7b2b78cbc84db26a383142a2b1) |
| `claimLot` | station | #5 | ví tự trả | [0xe7d2c2af…](https://testnet.snowtrace.io/tx/0xe7d2c2afbfbc4bb6ff73c786f791bfd14e78eb67b2ac3ab003c013a094bf5758) |
| `releaseLot` | station | #5 | ví tự trả | [0xd1b31083…](https://testnet.snowtrace.io/tx/0xd1b310831e8c9e584d0339f617f2032f30e8b381a0c41d740bbc92ef9f106858) |
| `claimLotSponsored` | station-sponsored | #5 | relayer trả | [0x32ff70d1…](https://testnet.snowtrace.io/tx/0x32ff70d17903be9023e45008c61b1b8a364e79ed0b60908ba2ac197705be95ee) |
| `proposeLot` | station-sponsored | #5 | relayer trả | [0x51cfbe32…](https://testnet.snowtrace.io/tx/0x51cfbe323307bd93d98339b99d7fa9199e89608fccd9864b7494b38a29974d41) |
| `acceptLot` | household-5 | #5 | relayer trả | [0xbcb2dfd3…](https://testnet.snowtrace.io/tx/0xbcb2dfd3340ca25495d245538728a11aa49496820238d44f18403fec8b34514c) |
| `createLot` | household-3 | #11 | relayer trả | [0xad88492a…](https://testnet.snowtrace.io/tx/0xad88492a8b78328bbc4ded8e998ebcd24dade3d08a98333245d9717375adf055) |
| `claimLot` | station | #11 | ví tự trả | [0x2dacfdbd…](https://testnet.snowtrace.io/tx/0x2dacfdbd57047602333d2264243db9616c74f899d5ea373f0f53f4cd2048be40) |
| `releaseLot` | station | #11 | ví tự trả | [0xe2b78148…](https://testnet.snowtrace.io/tx/0xe2b781489d0c1f914c7ee88bd721d05d4455f33236aae0080bb90d3317bc8532) |
| `claimLotSponsored` | station-sponsored | #11 | relayer trả | [0x67f43268…](https://testnet.snowtrace.io/tx/0x67f432680d00c94a0e526ae87eb7078216c60683c74054e013969cb4560b5a84) |
| `proposeLot` | station-sponsored | #11 | relayer trả | [0xdb0b4cf7…](https://testnet.snowtrace.io/tx/0xdb0b4cf715bd4855284fee16966ee8c74d4a8e38b64d0eeac64f96264681b8e5) |
| `acceptLot` | household-3 | #11 | relayer trả | [0x4feb05fa…](https://testnet.snowtrace.io/tx/0x4feb05fa0114d9b537a62c45f98a23293b6d0154bab146b78f02e4f8e4d8b5de) |
| `createLot` | household-8 | #16 | relayer trả | [0xe65b31f7…](https://testnet.snowtrace.io/tx/0xe65b31f72f7b85742011b1d4b2d092021b6ded8e96e88effc9f20e543bc5c10e) |
| `claimLot` | station | #16 | ví tự trả | [0xbbfcd302…](https://testnet.snowtrace.io/tx/0xbbfcd302178dd05932daf2236fb895ac9330ae0439608e6536b28d1c5cd6af68) |
| `releaseLot` | station | #16 | ví tự trả | [0xaad285a6…](https://testnet.snowtrace.io/tx/0xaad285a6cfafa12cd5cb24f8a1881d94b3a506454158c6e215a40ecd99d903a6) |
| `claimLotSponsored` | station-sponsored | #16 | relayer trả | [0xa81ca5c9…](https://testnet.snowtrace.io/tx/0xa81ca5c90d38ea88de337aee79033d5c62f094bffb7bdd5f5696ccc1ceef7e6c) |
| `proposeLot` | station-sponsored | #16 | relayer trả | [0x9328e8d9…](https://testnet.snowtrace.io/tx/0x9328e8d9d0024b7e2ac01c9d65a62d5b9fd1459d47aadfc1fe751993b49614b9) |
| `acceptLot` | household-8 | #16 | relayer trả | [0x8a7932bb…](https://testnet.snowtrace.io/tx/0x8a7932bb91322a9b00240affb39cd5e1a014942abc821f3b2ad573328e3770a6) |
| `createLot` | household-6 | #22 | relayer trả | [0xee49f76c…](https://testnet.snowtrace.io/tx/0xee49f76c07f258f7506a12583c84ff0862e516dfdc014bc36ccb2ff4e9370f3c) |
| `claimLot` | station | #22 | ví tự trả | [0x9a91eae0…](https://testnet.snowtrace.io/tx/0x9a91eae0435bb55abf62a65739fc5bd8aba210ec3ed0e9c0e5ff443fb3b1549a) |
| `releaseLot` | station | #22 | ví tự trả | [0x425a685d…](https://testnet.snowtrace.io/tx/0x425a685d71dec61aa5b671f6045a18083e4c3176b6ec4e4bfb615e75e17b3ea7) |
| `claimLotSponsored` | station-sponsored | #22 | relayer trả | [0x131f7604…](https://testnet.snowtrace.io/tx/0x131f7604c858ec975929b62c9d66478ae78f63821e8ed7939e635bc3783afb79) |
| `proposeLot` | station-sponsored | #22 | relayer trả | [0xb77aa77b…](https://testnet.snowtrace.io/tx/0xb77aa77babc9e9363b66e33f42f796d9444fd62ddbd5c8aaf27e57c1832dea65) |
| `acceptLot` | household-6 | #22 | relayer trả | [0x700b9466…](https://testnet.snowtrace.io/tx/0x700b9466b293ac7df359d7f5635cdeac318edb37accfae14ce1c3abbf624df5d) |

## F · Hộ dân hủy lô đang mở

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `createLot` | household-6 | #6 | relayer trả | [0x15481a5b…](https://testnet.snowtrace.io/tx/0x15481a5bc9967335fe7c7a139528d24679128de893f182b98b41846b746d1d86) |
| `cancelLot` | household-6 |  | relayer trả | [0xfb8547f5…](https://testnet.snowtrace.io/tx/0xfb8547f5314d738b18d141648a6825badcd53c82d1db85ee75d0984696e2d7f1) |
| `createLot` | household-1 | #17 | relayer trả | [0xc1b33993…](https://testnet.snowtrace.io/tx/0xc1b339936c53024a49653e3c20f0abc86d8ddd2dd556beaba81fe97bbe965678) |
| `cancelLot` | household-1 |  | relayer trả | [0x9c228cc5…](https://testnet.snowtrace.io/tx/0x9c228cc5ba2bdb9956aa44b8c1bc4390ac63decf274aa74df4b29b5c7fecdf85) |

## G · Đổi quà (đốt ECO) + trạm xác nhận giao

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `redeemReward` | household-1 |  | relayer trả | [0x19297b27…](https://testnet.snowtrace.io/tx/0x19297b2742ba5634c9d7da90a43c846b3546dd16125d7a67f3626e02cd8fe5a3) |
| `fulfillRewardRedemption` | station |  | ví tự trả | [0x70c20d9c…](https://testnet.snowtrace.io/tx/0x70c20d9c022e4eeb1afa83696c11b10f3c593f42e1bca80a9d0d8ffc49ac0882) |
| `redeemReward` | household-2 |  | relayer trả | [0xa21267aa…](https://testnet.snowtrace.io/tx/0xa21267aabaa2786c22414a5104d44c59f0939c672dcdea032e276d3b8630bea5) |
| `fulfillRewardRedemption` | station |  | ví tự trả | [0x274a9481…](https://testnet.snowtrace.io/tx/0x274a94810fb761e9d8277306cc8c5fc6781117b5e099ceac99cb65149b174686) |
| `redeemReward` | household-3 |  | relayer trả | [0xeec4dcae…](https://testnet.snowtrace.io/tx/0xeec4dcae12b184dfbc13b07cee7f4bd9371c52366167e6d8cfb863265a516476) |
| `fulfillRewardRedemption` | station |  | ví tự trả | [0x4a04d493…](https://testnet.snowtrace.io/tx/0x4a04d493165a238ee3e92d2a73c2096df815e96f568dce44488c19922d52d6a9) |
| `redeemReward` | household-4 |  | relayer trả | [0xc0b162a2…](https://testnet.snowtrace.io/tx/0xc0b162a235784b26b61d9f28ce3fbf3e1945f18f247e5af9a2f2806590dc91ca) |
| `fulfillRewardRedemption` | station |  | ví tự trả | [0xe1fcfef8…](https://testnet.snowtrace.io/tx/0xe1fcfef868829dcd5715861039e9f885e1c83afd7ee2479427aa869dec657d60) |
| `redeemReward` | household-5 |  | relayer trả | [0xd7e97e90…](https://testnet.snowtrace.io/tx/0xd7e97e90a055debf7b6b64bfeaf89ec81f15695928cd23822b5ff76d456f79fc) |
| `fulfillRewardRedemption` | station |  | ví tự trả | [0xb8aa43aa…](https://testnet.snowtrace.io/tx/0xb8aa43aa23c9f34560dbc2d45bf458e666f4b846811ec17cd4b6871bf2239156) |
| `redeemReward` | household-6 |  | relayer trả | [0x77247d05…](https://testnet.snowtrace.io/tx/0x77247d05901b1ef88c2d8eb92e352e0582d50e1ffc7f765ca26a28e4333b1289) |
| `fulfillRewardRedemption` | station |  | ví tự trả | [0xbd440bb4…](https://testnet.snowtrace.io/tx/0xbd440bb4395b085afb0027b440016e9c5496b8a7142b9d1a41da787b24796bc3) |
| `redeemReward` | household-7 |  | relayer trả | [0xeffd08d3…](https://testnet.snowtrace.io/tx/0xeffd08d30b347c238dbfa4bf03855417b00c69566f61814c99ff0b35fadf228b) |
| `fulfillRewardRedemption` | station |  | ví tự trả | [0xe4480829…](https://testnet.snowtrace.io/tx/0xe4480829cc377197c43192e0c7f74467485a7f646db657e82d88ed144aa429f8) |
| `redeemReward` | household-8 |  | relayer trả | [0x5047b204…](https://testnet.snowtrace.io/tx/0x5047b204ab339b29bc6c58a063630a9e164d6f262adc83b7288af2b94978306e) |
| `fulfillRewardRedemption` | station |  | ví tự trả | [0x2b9d5bcd…](https://testnet.snowtrace.io/tx/0x2b9d5bcdb278094e1eef7058e3612e5b7d0bc28c1ce5d3a1662abdf1bd92d2ad) |

## H · Điểm danh (chỉ ví có lô đã xác minh)

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `claimCheckIn` | household-1 |  | ví tự trả | [0x57184e9a…](https://testnet.snowtrace.io/tx/0x57184e9ae690f24fca7de6c243a23530761b5203ea52bfccbc2757ba93826ade) |
| `claimCheckIn` | household-2 |  | ví tự trả | [0x7f21214f…](https://testnet.snowtrace.io/tx/0x7f21214ff0a0e992b4ea3b9aa81abee9037e02dfc5df7c321012212ca569a1c6) |
| `claimCheckIn` | household-3 |  | ví tự trả | [0xa6a82413…](https://testnet.snowtrace.io/tx/0xa6a82413c038e8c921a345e0c452b04fe5fdb035415bb12470af63c7c9110bff) |
| `claimCheckIn` | household-4 |  | ví tự trả | [0x103b3533…](https://testnet.snowtrace.io/tx/0x103b3533b44f0d90790a4ec8669aefea2cf69cfd3d006cb4c145bcff5a13ecb6) |
| `claimCheckIn` | household-5 |  | ví tự trả | [0xf666cb3d…](https://testnet.snowtrace.io/tx/0xf666cb3df2fdbe06052c067861b9e55ac10bc69fe0b9dae50e0d0372edc0d45d) |
| `claimCheckIn` | household-6 |  | ví tự trả | [0x13ddae32…](https://testnet.snowtrace.io/tx/0x13ddae323c6b27801380bf75be58af92a9fa3d5d2c533b5cabe00ae9720a0128) |
| `claimCheckIn` | household-7 |  | ví tự trả | [0x443b0889…](https://testnet.snowtrace.io/tx/0x443b08896718bb2de2f8f2c3b6930213b235a357e8dbf34b329e46d7a1ab81b2) |
| `claimCheckIn` | household-8 |  | ví tự trả | [0x57e3a9ae…](https://testnet.snowtrace.io/tx/0x57e3a9ae0a8ef75e81386ea55371810b92af076d9b5d12a575e447aaf030197e) |

## H · Nhiệm vụ tái chế

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `claimMission` | household-1 |  | ví tự trả | [0x782da640…](https://testnet.snowtrace.io/tx/0x782da640b67204fa302e5dc6f86ee7654257a7b446ed1f6bd8ea434cec6a6198) |
| `claimMission` | household-1 |  | ví tự trả | [0xfb681797…](https://testnet.snowtrace.io/tx/0xfb68179792f99016cf405d121b120410264f5c904cdc251a127266a3a3e6479a) |
| `claimMission` | household-2 |  | ví tự trả | [0x3ff281f5…](https://testnet.snowtrace.io/tx/0x3ff281f50ae0162308f1c6caa5c96b85f7296ff41abf1dc23b1410d86e4ee183) |
| `claimMission` | household-2 |  | ví tự trả | [0x30476f7c…](https://testnet.snowtrace.io/tx/0x30476f7cdab7a45281df0a8fa88f4d9ef8330d9ff596d5829a8a55e45af90905) |
| `claimMission` | household-3 |  | ví tự trả | [0x0d775ad0…](https://testnet.snowtrace.io/tx/0x0d775ad0a2ea703f5456a75f3f09e6edc5c36bee3fbc8a2c8f9b282115a6948b) |
| `claimMission` | household-3 |  | ví tự trả | [0x0d4ab81a…](https://testnet.snowtrace.io/tx/0x0d4ab81ac5d16e10e9680cfc29a12f7d331132f87d4e03ec741aa19ab0a262ce) |
| `claimMission` | household-4 |  | ví tự trả | [0xbd49c572…](https://testnet.snowtrace.io/tx/0xbd49c5728350dff9f5afefbeca521354e3bb2b92b64a92386c8c631e52590058) |
| `claimMission` | household-4 |  | ví tự trả | [0x39dcf763…](https://testnet.snowtrace.io/tx/0x39dcf763336c0a8ae563d30efa981343cc34ca6568ec29f29ed01d06f2b4a734) |
| `claimMission` | household-5 |  | ví tự trả | [0xaa14ccd9…](https://testnet.snowtrace.io/tx/0xaa14ccd91317177fccf74331b6a38d20de916c2d24df94f72d594a2798e28455) |
| `claimMission` | household-5 |  | ví tự trả | [0x88434d7f…](https://testnet.snowtrace.io/tx/0x88434d7fb52da195acc70a0b51baeffec3d93b08b1bfb9e492f505faca768ec2) |
| `claimMission` | household-6 |  | ví tự trả | [0xdd24cabd…](https://testnet.snowtrace.io/tx/0xdd24cabd0c4f069d7a0334f0b81efccbec05798dd6d734fa25e135c41fc74030) |
| `claimMission` | household-6 |  | ví tự trả | [0x2e3406d4…](https://testnet.snowtrace.io/tx/0x2e3406d406475a68003b192a2d58c2485caa5c7101d09a16086129480b76f965) |
| `claimMission` | household-7 |  | ví tự trả | [0xd6708741…](https://testnet.snowtrace.io/tx/0xd67087410a2037a3a5d04e2741cea353c54d71e3244a79384ab79e7dc92f4cf3) |
| `claimMission` | household-7 |  | ví tự trả | [0xed622491…](https://testnet.snowtrace.io/tx/0xed62249128c3d253b906777227495015fcd5af2a5fca65ab3b4bd02291a51b93) |
| `claimMission` | household-8 |  | ví tự trả | [0x9b613ae1…](https://testnet.snowtrace.io/tx/0x9b613ae1f7d96d18d6f410862747c71d7fd8542bff469b85bfa5c3ba7b742ea5) |
| `claimMission` | household-8 |  | ví tự trả | [0x70fb45f6…](https://testnet.snowtrace.io/tx/0x70fb45f669a999d38bb2dc75e6d6c91ac53918373db20e5bff8c5b225a50df77) |

## Trạng thái demo: lô đang mở

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `createLot` | household-7 | #23 | relayer trả | [0xfa37630a…](https://testnet.snowtrace.io/tx/0xfa37630a9f5064fbcb078e4e528a7b2b0387b6adc83fc903fe09c5344fb9bab9) |

## Trạng thái demo: lô đã nhận

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `createLot` | household-8 | #24 | relayer trả | [0xfad1d8e4…](https://testnet.snowtrace.io/tx/0xfad1d8e43eee0e8bb3d9573401e79e88fa9782e29608b64f45b5bd88ecd2cf34) |
| `claimLotSponsored` | station-sponsored | #24 | relayer trả | [0xf13d782b…](https://testnet.snowtrace.io/tx/0xf13d782b41adbedafc5b127ea3023b44204730fa2c910a5bde5dea53b06cc97f) |

## Trạng thái demo: chờ hộ dân xác nhận

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `createLot` | household-1 | #25 | relayer trả | [0x2d923929…](https://testnet.snowtrace.io/tx/0x2d923929ffd83d562dcc40ef09438baef87965d6d83730743ae9c183d9243807) |
| `claimLot` | station | #25 | ví tự trả | [0xf3736e72…](https://testnet.snowtrace.io/tx/0xf3736e72cdc809379975754b52130f729e66df16151dceafafe530f484671532) |
| `proposeLot` | station | #25 | ví tự trả | [0xfa5dc7ca…](https://testnet.snowtrace.io/tx/0xfa5dc7caed9586f501eaa48dd5c6b93b0e73113ee876162854a46dd08e538394) |

## Chuẩn bị (cấp quyền, nạp AVAX/ECO test)

| Bước | Ví | Lô | Gas | Tx |
|---|---|---|---|---|
| `grantRole` | admin |  | ví tự trả | [0x5f71b620…](https://testnet.snowtrace.io/tx/0x5f71b62017300c34529f681d098c7e018fcce6c5d35409f3f8098fcdd75594a2) |
| `grantRole` | admin |  | ví tự trả | [0x31a11a0e…](https://testnet.snowtrace.io/tx/0x31a11a0eff990a774d9a909a3bf04fdeb7911a32a6e7a70e9becbb37b34e22ce) |
| `fund AVAX 0.05` | admin → collector-p2p |  | ví tự trả | [0xf12028fb…](https://testnet.snowtrace.io/tx/0xf12028fb0b03973894fadbfaee229d5747f8ba753c563965161709cc6e388c4f) |
| `fund AVAX 0.001` | admin → household-3 |  | ví tự trả | [0x5827f7bf…](https://testnet.snowtrace.io/tx/0x5827f7bf13606ccf374f0725a5788586afb79625f3669d34f8473f348bcdf608) |
| `fund AVAX 0.001` | admin → household-4 |  | ví tự trả | [0xf7e83f39…](https://testnet.snowtrace.io/tx/0xf7e83f39e89c9a07913c7b0d8167c72f821db47f47cacd4ad361f885292be689) |
| `fund AVAX 0.001` | admin → household-5 |  | ví tự trả | [0xf2bfb3d3…](https://testnet.snowtrace.io/tx/0xf2bfb3d37d20253ffa554d6e6f5f4af6536f36e177acc9f53036cb8a8ab1ed50) |
| `fund AVAX 0.001` | admin → household-6 |  | ví tự trả | [0x5a56dc7b…](https://testnet.snowtrace.io/tx/0x5a56dc7b54de4eb00bb8b0ca6c4d3935dd40fc5ac464695326da08e1b17a0141) |
| `fund AVAX 0.001` | admin → household-7 |  | ví tự trả | [0x0b7c8c82…](https://testnet.snowtrace.io/tx/0x0b7c8c826ed0c6ac9895d58494e284ebc2b1070eb2cc6dfd2378bcfe6def0678) |
| `fund AVAX 0.001` | admin → household-8 |  | ví tự trả | [0x5befb78a…](https://testnet.snowtrace.io/tx/0x5befb78a1c83ad884dce1fa40f3dcd639a128067c318c7a135ca3c8f228c1cca) |
| `buyEco` | admin |  | ví tự trả | [0x31d4eca9…](https://testnet.snowtrace.io/tx/0x31d4eca9e8405f46ace211fb49796523ae25d7ba64850fb357e246301003db7d) |
| `transfer` | admin |  | ví tự trả | [0x9029f736…](https://testnet.snowtrace.io/tx/0x9029f73629056cfedda66fcec6ffadf18f91ec9e945596497f52a464baa6986b) |
| `buyEco` | admin |  | ví tự trả | [0xf7c727a1…](https://testnet.snowtrace.io/tx/0xf7c727a114e0e958cd3abf1358be72470703d0a511fae91efa15051c7e448f0e) |
| `transfer` | admin |  | ví tự trả | [0xf8b42e78…](https://testnet.snowtrace.io/tx/0xf8b42e78d032a5ab9cdc6945bd8469af98f0d9e181d7dbe8dff79c036e65947e) |
| `buyEco` | admin |  | ví tự trả | [0x8daf4a6f…](https://testnet.snowtrace.io/tx/0x8daf4a6f92cb53efc9275fc6697963c3b93d83ab31315d59c5596667b8e2dbdd) |
| `transfer` | admin |  | ví tự trả | [0x1d2e6751…](https://testnet.snowtrace.io/tx/0x1d2e6751cece896a41f4322ecec6bd3f237320c76d6306e51e66d3fc3205f4cc) |


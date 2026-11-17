# 面层贴图（第二批）· 出处与授权

本目录里的贴图由 `scripts/textures/fetch-scans.py` 按 `scripts/textures/scans.json` 从下面两个站点下载并加工：

- [Poly Haven](https://polyhaven.com) —— 以 CC0 1.0 发布（<https://polyhaven.com/license>）。
- [ambientCG](https://ambientcg.com) —— 以 CC0 1.0 发布（<https://docs.ambientcg.com/license/>）。

CC0 1.0 是公共领域贡献：可以商用、修改、再分发，不要求署名。这里仍然逐项记下出处，方便核对和更新。

每一套贴图对应的原始页面、作者、下载地址、校验值和加工方式，见同目录的 `manifest.json`。
加工只有：缩放、JPEG 重新压缩、个别转 90°、把连续石材切成板并画出板缝、把颜色贴图的平均色调成浅中性色
（材质的色调由顶点色和 tint 给）。没有生成式合成。

运行时不访问这两个站点：贴图随构建打包，自行托管。

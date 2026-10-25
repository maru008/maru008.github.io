# Naoki Yoshimaru ポートフォリオサイト

公開サイト: <https://naokiyoshimaru.com/>

HTML・CSS・JavaScriptによる静的サイトです。ResearchMapからダウンロードしたデータを `researchmap-json/` に置いて更新します。フォームエディタは使用しません。

## ResearchMapデータの更新

1. ResearchMapから最新のJSONをダウンロードします。
2. `researchmap-json/` の古いファイルを取り除き、新しいファイルを1つ置きます。
3. 変更をコミットして `main` ブランチにpushします。

ファイル名は自由です。拡張子 `.json` または `.jsonl`（大文字も可）を検出します。JSON配列、1件のJSONオブジェクト、ResearchMapのJSONL（1行1レコード）に対応しています。レコードはResearchMapの `insert` / `merge` 形式を使用します。

フォルダ内の対象ファイルは常に1つにしてください。0個または複数ある場合は、ビルドをエラーにして更新を停止します。

```sh
python3 scripts/build_public_data.py
python3 -m unittest discover -s tests -v
node --test tests/test_researchmap_js.mjs
git add researchmap-json
git commit -m "ResearchMapデータを更新"
git push origin main
```

GitHub Actionsがテストと公開用データの生成を行い、GitHub Pagesへ自動公開します。通常の更新ではローカルでの生成は必須ではありません。

## ローカルで確認

Python 3とNode.js（JavaScriptのテスト用）を使用します。外部パッケージは不要です。

```sh
python3 scripts/build_public_data.py
python3 -m http.server 8000 --bind 127.0.0.1
```

- プロフィール: <http://127.0.0.1:8000/>
- 研究業績: <http://127.0.0.1:8000/publications.html>

JSONを入れ替えたら、生成コマンドを再実行してブラウザを再読み込みします。確認後は `Ctrl+C` でサーバーを終了します。

## 構成と公開範囲

- `researchmap-json/`: ResearchMapからダウンロードした元データ（1ファイル）
- `scripts/build_public_data.py`: ファイルを自動検出し、公開用データを生成
- `data/public/researchmap.json`: サイトが読み込む生成データ
- `index.html` / `publications.html`: プロフィール・研究業績ページ
- `assets/`: CSS・JavaScript・画像
- `tests/`: 読み込み・公開データ生成・日付表示のテスト
- `.github/workflows/pages.yml`: GitHub Pagesの公開設定

元データは加工せず、公開設定が `closed` / `researchers_only` の業績を生成時に除外します。研究者プロフィールは表示に必要な項目のみ抽出し、非公開の所属・学位も除外します。

公開サイトへ配置するのはHTML、`assets/`、`data/public/`、`CNAME`のみです。`researchmap-json/` は公開サイトへ配置しません。ただし、公開GitHubリポジトリへコミットした元データはリポジトリから閲覧できます。

`data/profile.yml` と `data/publications.sql.txt` は以前の形式の参考資料です。現在の表示には使用しません。

GitHubの「Settings → Pages」でSourceを「GitHub Actions」に設定します。公開結果は「Actions」の `Deploy portfolio to GitHub Pages` で確認できます。

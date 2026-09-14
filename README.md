# Naoki Yoshimaru ポートフォリオサイト

Naoki Yoshimaru のポートフォリオサイトを管理するリポジトリです。

- 公開サイト: <https://naokiyoshimaru.com/>
- 公開方法: GitHub Pages（`main` ブランチへの push で自動更新）
- 構成: HTML、CSS、JavaScript による静的サイト

## 主なファイルとディレクトリ

- `index.html`: トップページ
- `publications.html`: 研究業績ページ
- `assets/`: CSS、JavaScript、画像などの公開用ファイル
- `data/researchmap_source/rm_researchers20260828.jsonl`: researchmap データの正本
- `data/public/researchmap.json`: Web サイトで読み込む公開用データ
- `editor/`: researchmap データを編集するローカルエディタ
- `scripts/build_public_data.py`: 正本から公開用データを生成するスクリプト
- `tests/`: データ編集・生成処理のテスト
- `.github/workflows/pages.yml`: GitHub Pages の自動公開設定

`data/profile.yml` と `data/publications.sql.txt` は、以前のデータ形式を参照するために残しています。現在のサイトで表示する研究業績は `data/public/researchmap.json` から読み込まれます。

## 必要な環境

- Git
- Python 3
- Web ブラウザ

外部パッケージのインストールやビルド作業は不要です。以下のコマンドは、特に記載がない限りリポジトリのルートディレクトリで実行してください。

## 初回準備

まだリポジトリを手元に取得していない場合は、次のコマンドを実行します。

```sh
git clone git@github.com:maru008/maru008.github.io.git
cd maru008.github.io
```

すでに取得済みの場合は、作業を始める前に `main` ブランチを最新にします。

```sh
git switch main
git pull --ff-only origin main
```

未コミットの変更がある状態では、意図しない競合を避けるため、内容を確認してから `git pull` してください。

```sh
git status
```

## ローカルでサイトを確認する

ブラウザからデータを正しく読み込めるように、HTML ファイルを直接開くのではなく、Python の簡易 HTTP サーバーを使います。

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

起動後、ブラウザで次のページを開きます。

- トップページ: <http://127.0.0.1:8000/>
- 研究業績ページ: <http://127.0.0.1:8000/publications.html>

確認が終わったら、サーバーを起動したターミナルで `Ctrl+C` を押して終了します。

## researchmap データを編集する

### ローカルエディタを使う場合

次のコマンドで編集画面を起動します。

```sh
python3 editor/researchmap_editor.py
```

ブラウザで <http://127.0.0.1:8765/> を開き、対象データを追加または編集します。

このエディタでは、論文・講演などの追加と既存レコードの編集ができます。保存時には、次の処理が自動で行われます。

1. 入力内容と JSON 構造を検証する
2. 編集前の正本を `data/researchmap_source/backups/` にバックアップする
3. 正本の JSONL を更新する
4. Web サイトで使用する `data/public/researchmap.json` を更新する

バックアップはローカル確認用であり、Git の管理対象には含まれません。

researchmap 側にも変更を反映する場合は、編集画面の「インポート用JSONLをダウンロード」からファイルを取得し、researchmap のインポート画面で手動登録してください。新規レコードには、researchmap が発行するまで業績 ID を付けません。

編集が終わったら、エディタを起動したターミナルで `Ctrl+C` を押して終了します。

### 正本の JSONL を直接変更した場合

`data/researchmap_source/rm_researchers20260828.jsonl` をエディタ以外の方法で変更した場合は、公開用データを再生成します。

```sh
python3 scripts/build_public_data.py
```

## 更新内容を確認する

GitHub に送る前に、テストを実行します。

```sh
python3 -m unittest discover -s tests -v
```

続いてローカルサーバーを起動し、少なくとも次の点をブラウザで確認します。

- トップページと研究業績ページが表示される
- 追加・修正した内容が正しい
- 非公開に設定した情報が表示されていない
- レイアウト崩れやブラウザのエラーがない
- ページ内のリンクが意図した URL を開く

最後に、変更されたファイルと差分を確認します。

```sh
git status
git diff
```

## GitHub に更新を反映する

### 1. 変更するファイルをステージする

`git status` で対象を確認してから、必要なファイルだけを追加します。次は例です。

```sh
git add README.md index.html publications.html assets data/public/researchmap.json data/researchmap_source/rm_researchers20260828.jsonl
```

すべての変更をまとめて追加する `git add .` は、バックアップや作業途中のファイルまで含める可能性があります。基本的には、上のように対象を指定してください。

ステージした内容を確認します。

```sh
git status
git diff --cached
```

### 2. コミットする

変更内容が分かるメッセージを付けてコミットします。

```sh
git commit -m "研究業績を更新"
```

コミットできたことを確認します。

```sh
git log -1 --oneline
```

### 3. GitHub に push する

```sh
git push origin main
```

`main` ブランチへの push を契機に、`.github/workflows/pages.yml` が自動実行されます。ワークフローでは次の処理を行います。

1. Python のテストを実行する
2. 正本の JSONL から公開用データを再生成する
3. 公開に必要な HTML、`assets/`、`data/public/`、`CNAME` だけをまとめる
4. GitHub Pages にデプロイする

正本の JSONL、元の ZIP、ローカルエディタ、バックアップ、テストコードは公開サイトには配置されません。

## 公開結果を確認する

1. GitHub のリポジトリページを開く
2. 「Actions」タブで `Deploy portfolio to GitHub Pages` を開く
3. 最新の実行が緑色のチェックマークになっていることを確認する
4. <https://naokiyoshimaru.com/> と <https://naokiyoshimaru.com/publications.html> を開いて表示を確認する

反映には少し時間がかかることがあります。古い内容が表示される場合は、しばらく待ってからページを再読み込みしてください。

ワークフローが失敗した場合は、失敗した処理のログを確認して修正し、再度コミットして push します。テストで失敗している場合は、公開処理は行われません。

## GitHub Pages の初回設定

通常は一度だけ、GitHub のリポジトリで次の設定を確認します。

1. 「Settings」→「Pages」を開く
2. 「Build and deployment」の Source が「GitHub Actions」になっていることを確認する
3. 独自ドメインを利用する場合は Custom domain が `naokiyoshimaru.com` になっていることを確認する

独自ドメインの設定は `CNAME` と DNS に関係するため、通常のコンテンツ更新時には変更しないでください。

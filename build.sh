npm install
npm run build
mkdir dist
cp package.json README.md dist/
cp -R lib dist/
cd dist
npm pack
cd ..
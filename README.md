Unfortunately, due to the limitations of Spotify's API, you will have to run this locally.

You will need to:
1. get a spotify client ID (google how to do this),
2. clone the repo
3. create a .env.local file with:

NEXT_PUBLIC_SPOTIFY_CLIENT_ID=your_client_ID_here

NEXT_PUBLIC_REDIRECT_URI=http://127.0.0.1:3000

Then run "npm install"
then run "npm run build"
then run "npm run start"
then in chrome open localhost:3000
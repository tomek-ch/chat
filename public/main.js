'use strict';

const currentChat = {
    userId: '',
    convoId: '',
    pic: '',
};

function updateUserInfo() {
    const id = getUserId();
    const user = firebase.firestore().collection('Users').doc(id);

    user.set({
        name: getUserName(),
        picture: getProfilePicUrl(),
        caseInsensitive: getUserName().toLowerCase()
    });
}

function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithRedirect(provider);
}

function signOut() {
    firebase.auth().signOut();
}

function getProfilePicUrl() {
    return firebase.auth().currentUser.photoURL;
}

function getUserName() {
    return firebase.auth().currentUser.displayName;
}

function getUserId() {
    return firebase.auth().currentUser.uid;
}

function authStateObserver(user) {
    if (user) {
        displayMainContent();
        updateUserInfo();
    } else {
        displaySignInScreen();
    }
}

function displaySignInScreen() {
    document.querySelector('.chat-section').hidden = true;
    document.querySelector('.sign-in-section').hidden = false;
}

function showFirstConversation() {
    const ref = firebase.firestore()
        .collection('Users')
        .doc(getUserId())
        .collection('conversations')
        .orderBy('timestamp', 'desc');

    const unsubscribe = ref.onSnapshot(async snapshot => {
        if (snapshot.docChanges()[0]) {
            const userId = snapshot.docChanges()[0].doc.id;
            const convoId = snapshot.docChanges()[0].doc.data().convoId;
            const pic = (await firebase.firestore().collection('Users').doc(userId).get())
                .data()
                .picture;

            chatWith(userId, convoId, pic);
            unsubscribe();
        }
    });
}

function displayMainContent() {
    document.querySelector('.chat-section').hidden = false;
    document.querySelector('.sign-in-section').hidden = true;

    const div = document.querySelector('.user-name');
    const pic = document.querySelector('.user-picture');

    pic.style.backgroundImage = `url(${getProfilePicUrl()})`;
    div.textContent = getUserName();

    loadConversations();
    showFirstConversation();
}

function addConvo(yourId, friendId, convoId) {
    firebase.firestore()
        .collection('Users')
        .doc(yourId)
        .collection('conversations')
        .doc(friendId)
        .set({ convoId, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
}

async function selectSearchResult(e) {
    const userId = e.currentTarget.id;
    await checkIfConversationExists(userId);
    const pic = document.querySelector(`.search-results [id="${userId}"] .user-picture`).style.backgroundImage;
    const convoId = (await firebase.firestore().collection('Users').doc(getUserId())
        .collection('conversations')
        .doc(userId)
        .get()).data().convoId;

    hideSearchResults();

    chatWith(userId, convoId, pic);
}

async function checkIfConversationExists(friendId) {
    const yourId = getUserId();

    const ref = firebase.firestore()
        .collection('Users')
        .doc(yourId)
        .collection('conversations')
        .doc(friendId);

    const convo = await ref.get();

    if (!convo.exists) {
        const convoRef = await firebase.firestore().collection('Conversations').add({});

        const convoId = convoRef.id;

        addConvo(yourId, friendId, convoId);
        addConvo(friendId, yourId, convoId);
    }
}

function displaySearchResults(results) {
    const ul = document.querySelector('.search-results');
    ul.tabIndex="0";
    ul.hidden = false;
    ul.textContent = '';

    for (let result of results) {
        const li = document.createElement('li');

        const userPicture = document.createElement('div');
        userPicture.classList.toggle('user-picture');
        userPicture.style.backgroundImage = `url(${result.data().picture})`;
        li.appendChild(userPicture);

        li.id = result.id;
        li.classList.toggle('result');
        const text = document.createTextNode(result.data().name);
        li.append(text);
        li.addEventListener('click', selectSearchResult);

        ul.appendChild(li);
    }
}

function hideSearchResults() {
    document.querySelector('.search-results').hidden = true;
}

async function searchUsers(e) {
    const text = e.target.value.toLowerCase();

    if (text) {
        const users = await firebase.firestore().collection('Users').
            orderBy('caseInsensitive').
            startAt(text)
            .endAt(text + '\uf8ff')
            .limit(5)
            .get();

        displaySearchResults(users.docs);
    } else hideSearchResults();
}

async function checkForUnread() {
    const unread = (await firebase.firestore().collection('Users').doc(getUserId())
        .collection('unread')
        .get())
        .docs;

    for (let message of unread) {
        if (message.id !== currentChat.userId) {
            document.querySelector(`.conversation[id="${message.id}"]`).classList.add('unread');
        } else {
            firebase.firestore().collection('Users').doc(getUserId()).collection('unread')
                .doc(message.id)
                .delete();
        }
    };
}

function loadConversations() {
    const ref = firebase.firestore()
        .collection('Users')
        .doc(getUserId())
        .collection('conversations')
        .orderBy('timestamp', 'desc');

    ref.onSnapshot(async snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                displayConversation(change.doc);
            } else if (change.type === 'modified') {
                moveToTop(change.doc);
            }
        });
        checkForUnread();
    });
}

async function chatWith(userId, convoId, pic) {
    currentChat.userId = userId;
    currentChat.convoId = convoId;
    currentChat.pic = pic;

    if (document.querySelector('.selected')) {
        document.querySelector('.selected').classList.toggle('selected');
    }
    if (document.querySelector(`.conversation[id="${userId}"]`)) {
        document.querySelector(`.conversation[id="${userId}"]`).classList.toggle('selected');
    }

    document.querySelector('.messages').textContent = '';
    loadMessages();

    const user = (await firebase.firestore().collection('Users').doc(currentChat.userId).get()).data();
    document.querySelector('.correspondent-name').textContent = user.name;
    document.querySelector('.correspondent-img').style.backgroundImage = `url(${user.picture})`;

    if (document.querySelector(`.conversation[id="${userId}"]`)) {
        markAsRead(userId);
    }

    document.querySelector('.current-chat').style.display = 'flex';
}

function markAsRead(id) {
    firebase.firestore().collection('Users').doc(getUserId()).collection('unread').doc(id).delete();
    document.querySelector(`.conversation[id="${id}"]`).classList.remove('unread');
}

function selectChat(e) {
    chatWith(e.currentTarget.id,
        e.currentTarget.dataset.convoId,
        e.currentTarget.firstChild.style.backgroundImage);
}

async function displayConversation(doc) {
    const userId = doc.id;
    const user = (await firebase.firestore().collection('Users').doc(userId).get()).data();

    const li = document.createElement('li');
    li.id = userId;
    li.dataset.convoId = doc.data().convoId;
    li.classList.toggle('conversation');
    if (li.id === currentChat.userId) li.classList.add('selected');
    li.addEventListener('click', selectChat);

    const pic = document.createElement('div');
    pic.classList.toggle('user-picture');
    pic.style.backgroundImage = `url(${user.picture})`;

    const name = document.createElement('div');
    name.classList.toggle('conversation-name');
    name.textContent = user.name;

    // const date =  doc.data().timestamp.toDate()
    // const time = `${date.getHours()}:${date.getMinutes()}`;
    
    // const lastMessageElement = document.createElement('div');
    // lastMessageElement.classList.toggle('last-message');
    // lastMessageElement.textContent = doc.data().lastMessage;
    // const timestampElement = document.createElement('div');
    // timestampElement.classList.toggle('conversation-timestamp');
    // timestampElement.textContent = ` • ${date.getHours()}:${date.getMinutes()}`;

    // li.appendChild(lastMessageElement);
    // li.appendChild(timestampElement);
    const lastMessage = document.createElement('div');
    lastMessage.textContent = doc.data().lastMessage;
    lastMessage.classList.toggle('last-message');

    li.appendChild(pic);
    li.appendChild(name);
    li.appendChild(lastMessage);
    document.querySelector('.conversations-list').appendChild(li);
}

function moveToTop(doc) {
    const li = document.querySelector(`.conversations-list [id="${doc.id}"]`);
    if (li) {
        const list = document.querySelector('.conversations-list')
        li.remove();
        li.childNodes[2].textContent = doc.data().lastMessage;
        list.insertBefore(li, list.firstChild);
    }
}

function displayMessage(message) {
    const div = document.createElement('div');
    const messages = document.querySelector('.messages');
    div.classList = message.sender === getUserId() ? 'sent' : 'received';
    div.classList.toggle('message');

    // const time = document.createElement('div');
    // time.textContent = message.timestamp;
    // div.appendChild(time);
    // const date =  message.timestamp.toDate()
    // div.title = `${date.getHours()}:${date.getMinutes()}`;

    if (message.sender !== getUserId()) {
        const pic = document.createElement('div');
        pic.classList.toggle('user-picture');
        div.appendChild(pic);
        pic.style.backgroundImage = `url(${currentChat.pic})`;
    }

    if (message.imageUrl) {
        
        const container = document.createElement('div');
        container.classList.toggle('image-message');
        div.appendChild(container);

        const img = document.createElement('img');
        img.addEventListener('load', () => {
            messages.scrollTop = messages.scrollHeight;
        });
        img.src = message.imageUrl;

        container.appendChild(img);

    } else {

        div.classList.toggle('text-message');
        
        const text = document.createElement('div');
        text.classList.toggle('message-text');
        text.textContent = message.text;

        div.appendChild(text);
    }

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

let unsubscribe = () => { };

function loadMessages() {
    unsubscribe();

    const query = firebase.firestore().collection('Conversations')
        .doc(currentChat.convoId)
        .collection('messages')
        .orderBy('timestamp')
    // .limit(32);

    unsubscribe = query.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            // console.log(change.type)
            if (change.type === 'added') {
                displayMessage(change.doc.data());
            }
        });
    });
}

function sendMessage() {
    const input = document.querySelector('.message-input');
    const message = input.value;
    input.value = '';

    if (message) {
        firebase.firestore().collection('Conversations').doc(currentChat.convoId).collection('messages').add({
            sender: getUserId(),
            text: message,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        firebase.firestore().collection('Users').doc(getUserId()).collection('conversations').
            doc(currentChat.userId)
            .set({
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                lastMessage: `You: ${message}`
            }, { merge: true });

        firebase.firestore().collection('Users').doc(currentChat.userId).collection('conversations').
            doc(getUserId())
            .set({
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                lastMessage: message,
            }, { merge: true });

        firebase.firestore().collection('Users').doc(currentChat.userId).collection('unread').
            doc(getUserId()).set({});
    }
}

function addImage() {
    document.querySelector('.image-input').click();
}

async function saveImageMessage(file) {

    const messageRef = 
        firebase.firestore().collection('Conversations').doc(currentChat.convoId).collection('messages')
            .doc();
    
    const filePath = `${getUserId()}/${messageRef.id}/${file.name}`;
    const fileSnapshot = await firebase.storage().ref(filePath).put(file);
    const url = await fileSnapshot.ref.getDownloadURL();

    messageRef.set({
        sender: getUserId(),
        imageUrl: url,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    firebase.firestore().collection('Users').doc(getUserId()).collection('conversations').
        doc(currentChat.userId)
        .set({
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessage: 'You sent an image'
        }, { merge: true });

    firebase.firestore().collection('Users').doc(currentChat.userId).collection('conversations').
        doc(getUserId())
        .set({
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessage: `You received an image`,
        }, { merge: true });

    firebase.firestore().collection('Users').doc(currentChat.userId).collection('unread').
        doc(getUserId()).set({});
}

function onMediaFileSelected(e) {
    e.preventDefault();
    const file = event.target.files[0];

    // Clear the selection in the file picker input.
    document.querySelector('.image-form').reset();

    // Check if the file is an image.
    if (file.type.match('image.*')) {
        saveImageMessage(file);
    }
}

function goBack() {
    document.querySelector('.current-chat').style.display = 'none';
}

function displayScrollbar() {
    let isScrolling;

    return e => {
        clearTimeout(isScrolling);
        e.target.classList.remove('hidden-scrollbar');
        isScrolling = setTimeout(() => e.target.classList.add('hidden-scrollbar'), 1000);
    }
}

function showScrollBarOnMouseOver(e) {
    e.target.classList.remove('hidden-scrollbar');
    setTimeout(() => e.target.classList.add('hidden-scrollbar'), 1000);
}

document.querySelector('.messages').addEventListener('scroll', displayScrollbar());
document.querySelector('.conversations').addEventListener('scroll', displayScrollbar());

document.querySelector('.messages').addEventListener('mouseenter', showScrollBarOnMouseOver);
document.querySelector('.conversations').addEventListener('mouseenter', showScrollBarOnMouseOver);

firebase.auth().onAuthStateChanged(authStateObserver);

document.querySelector('.sign-in-button').addEventListener('click', signIn);
document.querySelector('.sign-out').addEventListener('click', signOut);

document.querySelector('.search-input').addEventListener('input', searchUsers);
document.querySelector('.search-input').addEventListener('focus', searchUsers);
document.querySelector('.search-input').addEventListener('blur', e => {
    if (!e.relatedTarget) hideSearchResults()
});

document.querySelector('.user-message').addEventListener('submit', sendMessage);
document.querySelector('.add-image').addEventListener('click', addImage);
document.querySelector('.image-input').addEventListener('change', onMediaFileSelected);

document.querySelector('.search').addEventListener('submit', e => e.preventDefault());
document.querySelector('.user-message').addEventListener('submit', e => e.preventDefault());
document.querySelector('.add-image').addEventListener('click', e => e.preventDefault());
document.querySelector('.image-form').addEventListener('submit', e => e.preventDefault());

document.querySelector('.back-button').addEventListener('click', goBack);
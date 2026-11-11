import pytest

from cookmate_voice.fast_path import match


@pytest.mark.parametrize(
    "utterance, command",
    [
        ("Agla batao", "next"),
        ("agla step", "next"),
        ("ho gaya", "next"),
        ("हो गया", "next"),
        ("next", "next"),
        ("acha, agla", "next"),
        ("pichla wala phir se", None),  # ambiguous: two commands in one sentence -> model decides
        ("pichla wala", "back"),
        ("पिछला", "back"),
        ("phir se bolo", "repeat"),
        ("फिर से", "repeat"),
        ("thoda dheere bolo", "slower"),
        ("ruko", "pause"),
        ("रुको", "pause"),
        ("chalo", "resume"),
        ("sab ho gaya", "done"),
        ("khana ban gaya", "done"),
        ("ek seeti hui", "whistle"),
        ("सीटी आई", "whistle"),
        ("kitna time bacha hai?", "timer_check"),
        ("कितना समय बचा है", "timer_check"),
    ],
)
def test_commands(utterance, command):
    result = match(utterance)
    assert (result.command if result else None) == command


@pytest.mark.parametrize(
    "utterance",
    [
        "agle step mein kitna namak daalna hai",  # a question that starts like a command
        "namak zyada ho gaya!",  # a problem -> rescue, not "next"
        "tamatar nahi hai",
        "paneer ki jagah kya daal sakte hain",
        "",
    ],
)
def test_questions_go_to_the_model(utterance):
    assert match(utterance) is None


@pytest.mark.parametrize(
    "utterance, minutes, label",
    [
        ("dal ke liye das minute ka timer laga do", 10, "dal"),
        ("10 minute ka timer", 10, None),
        ("पाँच मिनट का टाइमर लगा दो", 5, None),
        ("set a fifteen minute timer", 15, None),
        ("set a rice fifteen minute timer", 15, "rice"),
        ("chawal ke liye ek ghante ka timer", 60, "chawal"),
        ("aadha minute ka timer", 0.5, None),
        ("चावल के लिए दस मिनट का टाइमर", 10, "चावल"),
    ],
)
def test_timer_set(utterance, minutes, label):
    result = match(utterance)
    assert result is not None and result.command == "timer_set"
    assert result.args["minutes"] == minutes
    assert result.args["label"] == label

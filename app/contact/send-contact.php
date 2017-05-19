<?php

// Really basic email script for the alpha site
include('./config/config.php');

function mg_send($to, $from_name, $from_email, $subject, $message) {

    $headers = array();
    // To send HTML mail, the Content-type header must be set
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-type: text/html; charset=iso-8859-1';
    // Additional headers
    $headers[] = 'From: '.$from_name.' <'.$from_email.'>';
    // Send now
    return mail($to, $subject, nl2br($message), implode("\r\n", $headers));

}

if(!empty($_POST['email']) && !filter_var($_POST['email'], FILTER_VALIDATE_EMAIL) === false && !empty($_POST['message'])) {
    header("Content-type:application/json");
    if(mg_send(DOMAIN_TO, $_POST['name'], $_POST['email'], 'Rocket Pool - '.strip_tags($_POST['subject']), strip_tags($_POST['message']))) {
        echo json_encode(array('success'=>'true'));
    }
}

?>